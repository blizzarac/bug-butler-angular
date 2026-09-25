import { Routes } from '@angular/router';
import { InvoicesComponent } from './invoices.component';
import { SettingsComponent } from './settings.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'invoices' },
  { path: 'invoices', component: InvoicesComponent, title: 'Invoices · Ledgerline' },
  { path: 'settings', component: SettingsComponent, title: 'Settings · Ledgerline' },
];
