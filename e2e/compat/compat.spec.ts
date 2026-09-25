import { expect, test } from '@playwright/test';

test('captures, marks up and sends a report in a fresh app', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /Report a bug/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Report a bug' });
  await dialog.getByLabel('Title').fill('Compatibility check');

  await dialog.getByRole('button', { name: 'Capture area' }).click();
  await page.mouse.move(40, 40);
  await page.mouse.down();
  await page.mouse.move(400, 300, { steps: 3 });
  await page.mouse.up();
  await dialog.getByRole('button', { name: /Open Area/ }).click();
  await expect(dialog.locator('canvas')).toBeVisible();
  await dialog.getByRole('button', { name: 'Back to the small panel' }).click();

  await page.route('**/api/bug-reports', (route) => route.fulfill({ status: 201, json: { key: 'COMPAT-1' } }));
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(dialog.getByText('COMPAT-1')).toBeVisible();
  expect(errors).toEqual([]);
});
