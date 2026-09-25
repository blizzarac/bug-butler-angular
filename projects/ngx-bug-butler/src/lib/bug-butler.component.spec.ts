import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BugButlerComponent } from './bug-butler.component';
import { BugButler } from './bug-butler.service';
import { BugButlerConfig } from './config';
import { provideBugButler } from './provide';
import { BugReport } from './report';
import { BugReportFiles, BugReportTransport } from './transport';

class FakeTransport extends BugReportTransport {
  sent: { report: BugReport; files: BugReportFiles }[] = [];
  async send(report: BugReport, files: BugReportFiles) {
    this.sent.push({ report, files });
    return { key: 'QA-7' };
  }
}

describe('BugButlerComponent', () => {
  let fixture: ComponentFixture<BugButlerComponent>;
  let transport: FakeTransport;
  let butler: BugButler;

  function create(config: Partial<BugButlerConfig> = {}) {
    transport = new FakeTransport();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideBugButler({ enabled: true, autoMount: false, environmentLabel: 'QA', user: () => 'qa@app.test', ...config }),
        { provide: BugReportTransport, useValue: transport },
      ],
    });
    fixture = TestBed.createComponent(BugButlerComponent);
    butler = TestBed.inject(BugButler);
    fixture.detectChanges();
  }

  const shadow = () => fixture.nativeElement.shadowRoot as ShadowRoot;
  const $ = <T extends Element = HTMLElement>(sel: string) => shadow().querySelector<T>(sel);
  const button = (text: string) => Array.from(shadow().querySelectorAll('button')).find((b) => b.textContent!.trim().startsWith(text))!;

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => sessionStorage.removeItem('bug-butler:draft'));

  it('renders nothing and ignores open() when disabled', () => {
    create({ enabled: false });
    butler.open();
    fixture.detectChanges();
    expect(shadow().querySelector('.fab')).toBeNull();
    expect(butler.isOpen()).toBeFalse();
  });

  it('shows the button with the environment badge and opens the panel', async () => {
    create();
    expect($('.fab .env')!.textContent).toBe('QA');
    $('.fab')!.click();
    await settle();
    expect($('[role=dialog]')).not.toBeNull();
    expect(butler.isOpen()).toBeTrue();
  });

  it('asks for a title before sending', async () => {
    create();
    butler.open();
    await settle();
    button('Send report').click();
    await settle();
    expect($('#bb-title-error')!.textContent).toContain('Add a short title');
    expect(transport.sent.length).toBe(0);
  });

  it('sends the report without the page details the reporter switched off', async () => {
    create();
    butler.open();
    await settle();
    const title = $<HTMLInputElement>('#bb-title')!;
    title.value = 'Totals are NaN';
    title.dispatchEvent(new Event('input'));
    button('Blocker').click();
    const user = $<HTMLInputElement>('#bb-ctx-user')!;
    user.checked = false;
    user.dispatchEvent(new Event('change'));
    await settle();

    button('Send report').click();
    await settle();

    expect(transport.sent.length).toBe(1);
    const { report, files } = transport.sent[0];
    expect(report.title).toBe('Totals are NaN');
    expect(report.severity).toBe('blocker');
    expect(report.context.user).toBeUndefined();
    expect(report.context.browser).toBeDefined();
    expect(report.context.timestamp).toBeDefined();
    expect(files).toEqual({ screenshots: [], attachments: [] });
    expect($('.done .key')!.textContent).toBe('QA-7');
    expect(sessionStorage.getItem('bug-butler:draft')).toContain('"title":""');
  });

  it('restores an unsent draft', async () => {
    sessionStorage.setItem('bug-butler:draft', JSON.stringify({ title: 'Half written', description: 'Steps', type: 'visual', severity: 'low' }));
    create();
    butler.open();
    await settle();
    expect($<HTMLInputElement>('#bb-title')!.value).toBe('Half written');
    expect(button('Visual').getAttribute('aria-pressed')).toBe('true');
  });
});
