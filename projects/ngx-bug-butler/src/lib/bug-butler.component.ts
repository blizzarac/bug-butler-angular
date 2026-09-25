import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Injector,
  OnDestroy,
  OnInit,
  ViewChild,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { BUG_BUTLER_CONFIG, BUG_BUTLER_ENABLED } from './config';
import { BugButler } from './bug-butler.service';
import { ContextKey, ContextService, ContextSnapshot } from './context.service';
import { BugReport, BugReportResult, BugSeverity, BugType } from './report';
import { CaptureRect, ScreenshotService } from './screenshot.service';
import { BugReportTransport } from './transport';
import { formatBytes, matchesShortcut } from './utils';
import { REPORTER_VERSION } from './version';

interface Shot {
  id: number;
  label: string;
  canvas: HTMLCanvasElement;
  thumb: string;
  undo: ImageData[];
}

type Status = 'idle' | 'sending' | 'sent' | 'error';
type MarkupTool = 'highlight' | 'redact';

const DRAFT_KEY = 'bug-butler:draft';

export const BUG_TYPES: { value: BugType; label: string }[] = [
  { value: 'bug', label: 'Bug' },
  { value: 'visual', label: 'Visual' },
  { value: 'data', label: 'Data' },
  { value: 'performance', label: 'Performance' },
];

export const SEVERITIES: { value: BugSeverity; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'blocker', label: 'Blocker' },
];

/**
 * The floating bug-report widget. Mounted automatically by `provideBugButler()`;
 * place `<bug-butler />` yourself only when `autoMount: false`.
 */
@Component({
  selector: 'bug-butler',
  standalone: true,
  templateUrl: './bug-butler.component.html',
  styleUrl: './bug-butler.component.css',
  encapsulation: ViewEncapsulation.ShadowDom,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-theme]': 'config.theme === "auto" ? null : config.theme',
    '[attr.data-position]': 'config.position',
    '[style.--bb-z]': 'config.zIndex',
  },
})
export class BugButlerComponent implements OnInit, OnDestroy {
  protected readonly config = inject(BUG_BUTLER_CONFIG);
  protected readonly enabled = inject(BUG_BUTLER_ENABLED);
  private readonly butler = inject(BugButler);
  private readonly contextService = inject(ContextService);
  private readonly screenshots = inject(ScreenshotService);
  private readonly transport = inject(BugReportTransport);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);

  private readonly canvasHost = signal<HTMLElement | undefined>(undefined);
  @ViewChild('canvasHost') private set canvasHostRef(ref: ElementRef<HTMLElement> | undefined) {
    this.canvasHost.set(ref?.nativeElement);
  }
  @ViewChild('titleInput') private titleInput?: ElementRef<HTMLInputElement>;

  protected readonly types = BUG_TYPES;
  protected readonly severities = SEVERITIES;
  protected readonly formatBytes = formatBytes;
  protected readonly round = Math.round;
  protected readonly shortcutHint = this.describeShortcut();

  protected readonly open = this.butler.isOpen;
  protected readonly expanded = signal(false);
  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly type = signal<BugType>('bug');
  protected readonly severity = signal<BugSeverity>('medium');
  protected readonly titleInvalid = signal(false);

  protected readonly shots = signal<Shot[]>([]);
  protected readonly selected = signal(0);
  protected readonly selectedShot = computed(() => this.shots()[this.selected()]);
  protected readonly tool = signal<MarkupTool>('highlight');
  protected readonly files = signal<File[]>([]);
  protected readonly dropping = signal(false);

  protected readonly snapshot = signal<ContextSnapshot | null>(null);
  protected readonly excluded = signal<ReadonlySet<ContextKey>>(new Set());
  protected readonly includedCount = computed(() => {
    const items = this.snapshot()?.items ?? [];
    return items.filter((i) => !this.excluded().has(i.key)).length;
  });

  /** `select` while choosing a region, `render` while the screenshot is drawn. */
  protected readonly capture = signal<'off' | 'select' | 'render'>('off');
  protected readonly selection = signal<CaptureRect | null>(null);
  protected readonly status = signal<Status>('idle');
  protected readonly result = signal<BugReportResult | null>(null);
  protected readonly errorMessage = signal('');
  protected readonly toast = signal('');

  private nextShotId = 1;
  private dragStart: { x: number; y: number } | null = null;
  private drawing: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; base: ImageData; a: { x: number; y: number }; tool: MarkupTool } | null = null;
  private toastTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    if (!this.enabled) return;
    this.restoreDraft();

    // Keep the markup stage showing the selected screenshot.
    effect(
      () => {
        const host = this.canvasHost();
        const shot = this.selectedShot();
        if (host) host.replaceChildren(...(shot ? [shot.canvas] : []));
      },
      { injector: this.injector },
    );

    effect(
      () => {
        const draft = { title: this.title(), description: this.description(), type: this.type(), severity: this.severity() };
        try {
          sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        } catch {
          /* storage unavailable */
        }
      },
      { injector: this.injector },
    );

    effect(
      () => {
        if (this.open()) {
          this.refreshContext();
          setTimeout(() => this.titleInput?.nativeElement.focus({ preventScroll: true }));
        }
      },
      { injector: this.injector, allowSignalWrites: true },
    );
  }

  ngOnDestroy(): void {
    clearTimeout(this.toastTimer);
  }

  // ---------- panel ----------

  protected toggle(): void {
    this.butler.toggle();
  }

  protected minimise(): void {
    this.expanded.set(false);
    this.butler.close();
  }

  protected toggleExpanded(): void {
    this.expanded.update((v) => !v);
  }

  protected setTitle(value: string): void {
    this.title.set(value);
    if (value.trim()) this.titleInvalid.set(false);
  }

  // ---------- screenshots ----------

  protected startAreaCapture(): void {
    this.selection.set(null);
    this.capture.set('select');
  }

  protected async captureScreen(): Promise<void> {
    await this.captureRect(undefined, 'Screen');
  }

  protected onCapturePointerDown(e: PointerEvent): void {
    this.dragStart = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  protected onCapturePointerMove(e: PointerEvent): void {
    if (!this.dragStart) return;
    this.selection.set(rectFrom(this.dragStart, { x: e.clientX, y: e.clientY }));
  }

  protected async onCapturePointerUp(e: PointerEvent): Promise<void> {
    if (!this.dragStart) return;
    const rect = rectFrom(this.dragStart, { x: e.clientX, y: e.clientY });
    this.dragStart = null;
    this.selection.set(null);
    if (rect.width < 8 || rect.height < 8) {
      this.capture.set('off');
      this.showToast('That area is too small. Drag across the part of the page you want to capture.');
      return;
    }
    await this.captureRect(rect, `Area ${Math.round(rect.width)}×${Math.round(rect.height)}`);
  }

  protected cancelCapture(): void {
    this.dragStart = null;
    this.selection.set(null);
    this.capture.set('off');
  }

  private async captureRect(rect: CaptureRect | undefined, label: string): Promise<void> {
    this.capture.set('render');
    // Let the overlay disappear before the page is drawn.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
      const canvas = await this.screenshots.capture(rect, this.host.nativeElement);
      this.addShot(canvas, label);
      this.showToast('Screenshot added');
    } catch (err) {
      console.warn('[bug-butler] Screenshot failed', err);
      this.showToast('The screenshot could not be taken. You can paste one instead.');
    } finally {
      this.capture.set('off');
    }
  }

  private addShot(canvas: HTMLCanvasElement, label: string): void {
    canvas.setAttribute('aria-label', label);
    // html2canvas sizes its canvas with inline styles; the stage sizes it with CSS instead.
    canvas.removeAttribute('style');
    // It also leaves its crop offset and scale on the context; markup draws in raw pixels.
    canvas.getContext('2d')?.setTransform(1, 0, 0, 1, 0, 0);
    const shot: Shot = { id: this.nextShotId++, label, canvas, thumb: canvas.toDataURL('image/png'), undo: [] };
    this.shots.update((list) => [...list, shot]);
    this.selected.set(this.shots().length - 1);
  }

  protected selectShot(index: number): void {
    this.selected.set(index);
    this.expanded.set(true);
  }

  protected removeShot(index: number, e?: Event): void {
    e?.stopPropagation();
    this.shots.update((list) => list.filter((_, i) => i !== index));
    this.selected.set(Math.max(0, Math.min(this.selected(), this.shots().length - 1)));
  }

  // markup: boxes drawn straight onto the screenshot canvas

  protected onStagePointerDown(e: PointerEvent): void {
    const canvas = (e.target as Element).closest?.('canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    this.drawing = { canvas, ctx, base: ctx.getImageData(0, 0, canvas.width, canvas.height), a: toCanvasPoint(canvas, e), tool: this.tool() };
    canvas.setPointerCapture?.(e.pointerId);
  }

  protected onStagePointerMove(e: PointerEvent): void {
    const d = this.drawing;
    if (!d) return;
    d.ctx.putImageData(d.base, 0, 0);
    drawBox(d.ctx, d.a, toCanvasPoint(d.canvas, e), d.tool, d.canvas.width);
  }

  protected onStagePointerUp(e: PointerEvent): void {
    const d = this.drawing;
    if (!d) return;
    this.drawing = null;
    const b = toCanvasPoint(d.canvas, e);
    if (Math.abs(b.x - d.a.x) < 6 || Math.abs(b.y - d.a.y) < 6) {
      d.ctx.putImageData(d.base, 0, 0);
      return;
    }
    this.updateSelectedShot((shot) => ({ ...shot, undo: [...shot.undo, d.base], thumb: shot.canvas.toDataURL('image/png') }));
  }

  protected undoMarkup(): void {
    this.updateSelectedShot((shot) => {
      const undo = [...shot.undo];
      const prev = undo.pop();
      if (prev) shot.canvas.getContext('2d')?.putImageData(prev, 0, 0);
      return { ...shot, undo, thumb: shot.canvas.toDataURL('image/png') };
    });
  }

  private updateSelectedShot(fn: (shot: Shot) => Shot): void {
    const i = this.selected();
    this.shots.update((list) => list.map((s, j) => (j === i ? fn(s) : s)));
  }

  // ---------- attachments ----------

  protected onFilesPicked(input: HTMLInputElement): void {
    this.addFiles(input.files);
    input.value = '';
  }

  protected onDragOver(e: DragEvent): void {
    e.preventDefault();
    this.dropping.set(true);
  }

  protected onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dropping.set(false);
    this.addFiles(e.dataTransfer?.files ?? null);
  }

  private addFiles(list: FileList | null): void {
    if (!list) return;
    const accepted: File[] = [];
    for (const file of Array.from(list)) {
      if (file.size > this.config.maxAttachmentBytes) {
        this.showToast(`${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(this.config.maxAttachmentBytes)} per file.`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length) this.files.update((f) => [...f, ...accepted]);
  }

  protected removeFile(index: number): void {
    this.files.update((f) => f.filter((_, i) => i !== index));
  }

  @HostListener('document:paste', ['$event'])
  protected async onPaste(e: ClipboardEvent): Promise<void> {
    if (!this.enabled || !this.open() || this.status() === 'sent') return;
    const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (!file) return;
    e.preventDefault();
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
      this.addShot(canvas, 'Pasted image');
      this.showToast('Pasted image added');
    } catch {
      this.showToast('That image could not be read. Attach it as a file instead.');
    }
  }

  // ---------- context ----------

  protected refreshContext(): void {
    this.snapshot.set(this.contextService.snapshot());
  }

  protected toggleContext(key: ContextKey, include: boolean): void {
    this.excluded.update((set) => {
      const next = new Set(set);
      include ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // ---------- submit ----------

  protected async submit(e?: Event): Promise<void> {
    e?.preventDefault();
    if (this.status() === 'sending') return;
    if (!this.title().trim()) {
      this.titleInvalid.set(true);
      this.titleInput?.nativeElement.focus();
      return;
    }
    this.status.set('sending');
    this.errorMessage.set('');
    try {
      this.refreshContext();
      const shots = this.shots();
      const files = this.files();
      const blobs = await Promise.all(shots.map((s) => canvasToBlob(s.canvas)));
      const report: BugReport = {
        title: this.title().trim(),
        type: this.type(),
        severity: this.severity(),
        description: this.description().trim(),
        context: { ...ContextService.exclude(this.snapshot()!.context, this.excluded()), timestamp: new Date().toISOString() },
        screenshots: shots.map((s, i) => ({ name: `screenshot-${i + 1}.png`, width: s.canvas.width, height: s.canvas.height })),
        attachments: files.map((f) => ({ name: f.name, type: f.type || 'application/octet-stream', size: f.size })),
        reporterVersion: REPORTER_VERSION,
      };
      const result = await this.transport.send(report, { screenshots: blobs, attachments: files });
      this.result.set(result);
      this.status.set('sent');
      this.expanded.set(false);
      this.clearDraft();
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'The report could not be sent.');
      this.status.set('error');
    }
  }

  protected startOver(): void {
    this.status.set('idle');
    this.result.set(null);
    setTimeout(() => this.titleInput?.nativeElement.focus());
  }

  private clearDraft(): void {
    this.title.set('');
    this.description.set('');
    this.type.set('bug');
    this.severity.set('medium');
    this.shots.set([]);
    this.files.set([]);
    this.excluded.set(new Set());
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  private restoreDraft(): void {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (typeof d.title === 'string') this.title.set(d.title);
      if (typeof d.description === 'string') this.description.set(d.description);
      if (BUG_TYPES.some((t) => t.value === d.type)) this.type.set(d.type);
      if (SEVERITIES.some((s) => s.value === d.severity)) this.severity.set(d.severity);
    } catch {
      /* ignore corrupt or unavailable storage */
    }
  }

  // ---------- keyboard & misc ----------

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(e: KeyboardEvent): void {
    if (!this.enabled) return;
    if (e.key === 'Escape') {
      if (this.capture() === 'select') return this.cancelCapture();
      if (this.expanded()) return this.expanded.set(false);
      if (this.open() && e.composedPath().includes(this.host.nativeElement)) return this.minimise();
      return;
    }
    if (this.config.shortcut && matchesShortcut(e, this.config.shortcut)) {
      e.preventDefault();
      this.toggle();
    }
  }

  private showToast(message: string): void {
    this.toast.set(message);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 3200);
  }

  private describeShortcut(): string {
    const s = this.config.shortcut;
    if (!s) return '';
    const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    const symbols: Record<string, string> = mac
      ? { ctrl: '⌘', cmd: '⌘', meta: '⌘', shift: '⇧', alt: '⌥' }
      : { ctrl: 'Ctrl+', cmd: 'Ctrl+', meta: 'Ctrl+', shift: 'Shift+', alt: 'Alt+' };
    return s
      .toLowerCase()
      .split('+')
      .map((p) => symbols[p.trim()] ?? p.trim().toUpperCase())
      .join('');
  }
}

function rectFrom(a: { x: number; y: number }, b: { x: number; y: number }): CaptureRect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

function toCanvasPoint(canvas: HTMLCanvasElement, e: PointerEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * canvas.width) / r.width, y: ((e.clientY - r.top) * canvas.height) / r.height };
}

function drawBox(ctx: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number }, tool: MarkupTool, width: number): void {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  if (tool === 'redact') {
    ctx.fillStyle = '#1c1c1c';
    ctx.fillRect(x, y, w, h);
    return;
  }
  ctx.fillStyle = 'rgba(217, 164, 65, 0.16)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#D9A441';
  ctx.lineWidth = Math.max(3, width / 300);
  ctx.strokeRect(x, y, w, h);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Screenshot could not be encoded.'))), 'image/png'));
}
