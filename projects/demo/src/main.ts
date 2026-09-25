import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { installFakeEndpoint } from './fake-endpoint';

// This repo has no backend. When you run the demo by hand, a fake endpoint answers
// in the browser. Automated tests (navigator.webdriver) intercept the request instead.
if (!navigator.webdriver) installFakeEndpoint('/api/bug-reports');

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
