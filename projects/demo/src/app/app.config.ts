import { ApplicationConfig, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBugButler } from 'bug-butler-angular';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideBugButler({
      // In a real app: `enabled: !environment.production` plus a build-time file replacement.
      enabled: true,
      allowedHosts: ['localhost', '127.0.0.1', /\.staging\.ledgerline\.test$/],
      endpoint: '/api/bug-reports',
      environmentLabel: isDevMode() ? 'LOCAL' : 'STAGING',
      destinationLabel: 'Jira · QA',
      build: 'web 4.18.2 · a1c9e07',
      user: () => 'qa.tester@ledgerline.test',
      customContext: () => ({ tenant: 'acme-eu', featureFlags: 'new-totals' }),
    }),
  ],
};
