import { Component } from '@angular/core';

@Component({
  selector: 'app-settings',
  standalone: true,
  template: `
    <div class="page-head"><div><div class="crumbs">Account</div><h1>Settings</h1></div></div>
    <form class="card form" (submit)="$event.preventDefault()">
      <label>Display name <input value="QA Tester" /></label>
      <label>Password <input type="password" value="correct horse battery staple" /></label>
      <label>API key <input data-bb-redact value="sk_live_51H8xY2eZvKYlo2C" /></label>
      <p class="note">The password and API key fields are blacked out in every screenshot.</p>
    </form>
  `,
})
export class SettingsComponent {}
