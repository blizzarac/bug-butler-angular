import { Component, OnInit } from '@angular/core';

interface Invoice {
  id: string;
  customer: string;
  due: string;
  amount: number;
  creditNote?: string;
}

// Credit note amounts, as the API would return them. CN-2041 is missing on purpose.
const CREDIT_NOTES: Record<string, { amount: number }> = {};

@Component({
  selector: 'app-invoices',
  standalone: true,
  templateUrl: './invoices.component.html',
})
export class InvoicesComponent implements OnInit {
  protected readonly invoices: Invoice[] = [
    { id: 'INV-2038', customer: 'Northwind Traders', due: '12 Sep', amount: 4200 },
    { id: 'INV-2041', customer: 'Brightwater GmbH', due: '14 Sep', amount: 1860, creditNote: 'CN-2041' },
    { id: 'INV-2044', customer: 'Kestrel Logistics', due: '17 Sep', amount: 9420.5 },
    { id: 'INV-2047', customer: 'Aurora Dental', due: '19 Sep', amount: 725 },
    { id: 'INV-2052', customer: 'Halden & Poe', due: '21 Sep', amount: 3118.2 },
  ];

  ngOnInit(): void {
    // The seeded bug: a credit note that fails to load produces NaN, a console error and a failed request.
    fetch('/api/credit-notes/CN-2041').catch(() => undefined);
    try {
      this.balance(this.invoices[1]);
    } catch (err) {
      console.error(err);
    }
  }

  protected balance(inv: Invoice): number {
    if (!inv.creditNote) return inv.amount;
    return inv.amount - CREDIT_NOTES[inv.creditNote].amount;
  }

  protected safeBalance(inv: Invoice): number {
    try {
      return this.balance(inv);
    } catch {
      return NaN;
    }
  }

  protected get total(): number {
    return this.invoices.reduce((sum, inv) => sum + this.safeBalance(inv), 0);
  }

  protected money(n: number): string {
    return Number.isNaN(n) ? 'NaN €' : '€ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
