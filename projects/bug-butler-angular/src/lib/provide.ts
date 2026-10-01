import {
  APP_BOOTSTRAP_LISTENER,
  ApplicationRef,
  ENVIRONMENT_INITIALIZER,
  EnvironmentInjector,
  EnvironmentProviders,
  PLATFORM_ID,
  createComponent,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { BUG_BUTLER_CONFIG, BUG_BUTLER_ENABLED, BugButlerConfig, isEnabled, resolveConfig } from './config';
import { BugButlerComponent } from './bug-butler.component';
import { ContextRecorder } from './context-recorder';
import { BugReportTransport, HttpBugReportTransport } from './transport';

/**
 * Registers the bug-report widget.
 *
 * ```ts
 * bootstrapApplication(AppComponent, {
 *   providers: [provideBugButler({ enabled: !environment.production, endpoint: '/api/bug-reports' })],
 * });
 * ```
 *
 * To send reports somewhere else, provide your own transport after this call:
 * `{ provide: BugReportTransport, useClass: MyTransport }`.
 */
export function provideBugButler(config: BugButlerConfig): EnvironmentProviders {
  const resolved = resolveConfig(config);
  return makeEnvironmentProviders([
    { provide: BUG_BUTLER_CONFIG, useValue: resolved },
    {
      provide: BUG_BUTLER_ENABLED,
      useFactory: () => isPlatformBrowser(inject(PLATFORM_ID)) && isEnabled(resolved, inject(DOCUMENT).location.hostname),
    },
    { provide: BugReportTransport, useClass: HttpBugReportTransport },
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue: () => {
        if (inject(BUG_BUTLER_ENABLED)) inject(ContextRecorder).install();
      },
    },
    {
      provide: APP_BOOTSTRAP_LISTENER,
      multi: true,
      useFactory: () => {
        const appRef = inject(ApplicationRef);
        const environmentInjector = inject(EnvironmentInjector);
        const doc = inject(DOCUMENT);
        const enabled = inject(BUG_BUTLER_ENABLED);
        let mounted = false;
        return () => {
          if (!enabled || !resolved.autoMount || mounted) return;
          mounted = true;
          const ref = createComponent(BugButlerComponent, { environmentInjector });
          appRef.attachView(ref.hostView);
          doc.body.appendChild(ref.location.nativeElement);
        };
      },
    },
  ]);
}
