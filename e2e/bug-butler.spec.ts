import { expect, Page, test } from '@playwright/test';

async function openPanel(page: Page) {
  await page.goto('/invoices');
  await expect(page.locator('td.bad')).toHaveText('NaN €');
  await page.getByRole('button', { name: /Report a bug/ }).last().click();
  await expect(page.getByRole('dialog', { name: 'Report a bug' })).toBeVisible();
}

/** Mean brightness of a region of the selected screenshot, 0 (black) to 255 (white). */
async function brightness(page: Page, box: { x: number; y: number; width: number; height: number }) {
  return page.locator('bug-butler').evaluate((host, b) => {
    const canvas = host.shadowRoot!.querySelector('canvas')!;
    const scale = canvas.width / window.innerWidth;
    const data = canvas.getContext('2d')!.getImageData(b.x * scale, b.y * scale, Math.max(1, b.width * scale), Math.max(1, b.height * scale)).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    return sum / (data.length / 4);
  }, box);
}

test('captures an area, marks it up, attaches a file and sends a multipart report', async ({ page }) => {
  await openPanel(page);
  const dialog = page.getByRole('dialog', { name: 'Report a bug' });

  await dialog.getByLabel('Title').fill('Invoice total shows NaN when a credit note is applied');
  await dialog.getByRole('button', { name: 'High' }).click();
  await dialog.getByLabel('What happened').fill('Balance of INV-2041 is NaN.');

  // Region capture: drag across the KPI cards.
  await dialog.getByRole('button', { name: 'Capture area' }).click();
  await expect(page.getByText('Drag to select an area')).toBeVisible();
  const kpis = await page.locator('.kpis').boundingBox();
  await page.mouse.move(kpis!.x, kpis!.y);
  await page.mouse.down();
  await page.mouse.move(kpis!.x + kpis!.width, kpis!.y + kpis!.height, { steps: 5 });
  await page.mouse.up();
  await expect(dialog.getByRole('img', { name: /^Area \d+×\d+$/ })).toBeVisible({ timeout: 15_000 });

  // The capture is a real rendering of the page, not an empty canvas.
  const size = await dialog.getByRole('img', { name: /^Area/ }).evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
  expect(size[0]).toBeGreaterThan(kpis!.width * 0.9);

  // Expand and draw a highlight box.
  await dialog.getByRole('button', { name: /Open Area/ }).click();
  const canvas = dialog.locator('canvas');
  await expect(canvas).toBeVisible();
  const c = (await canvas.boundingBox())!;
  await page.mouse.move(c.x + 10, c.y + 10);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(dialog.getByRole('button', { name: 'Undo' })).toBeEnabled();
  // The box's brass outline is painted into the screenshot where the drag started.
  const corner = await canvas.evaluate((el: HTMLCanvasElement) => {
    const r = el.getBoundingClientRect();
    const s = el.width / r.width;
    return [...el.getContext('2d')!.getImageData(Math.round(10 * s), Math.round(10 * s), 1, 1).data];
  });
  expect(corner.slice(0, 3)).toEqual([217, 164, 65]);
  expect(c.height / c.width).toBeCloseTo(size[1] / size[0], 1);
  await dialog.getByRole('button', { name: 'Back to the small panel' }).click();

  await dialog.locator('input[type=file]').setInputFiles({ name: 'steps.txt', mimeType: 'text/plain', buffer: Buffer.from('1. open invoices') });
  await expect(dialog.getByText('steps.txt')).toBeVisible();

  // Page details show the seeded console error and failed request.
  await dialog.getByText('Page details included').click();
  await expect(dialog.locator('.ctx-item .v.alert')).toHaveCount(2);

  let body: Buffer | null = null;
  let contentType = '';
  await page.route('**/api/bug-reports', async (route) => {
    body = route.request().postDataBuffer();
    contentType = (await route.request().allHeaders())['content-type'];
    await route.fulfill({ status: 201, json: { key: 'QA-1287', url: 'https://example.atlassian.net/browse/QA-1287' } });
  });
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(dialog.getByText('QA-1287')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Open ticket' })).toHaveAttribute('href', 'https://example.atlassian.net/browse/QA-1287');

  expect(contentType).toContain('multipart/form-data');
  const raw = body!.toString('latin1');
  const json = raw.match(/name="report"; filename="report.json"\r\nContent-Type: application\/json\r\n\r\n(.*?)\r\n--/s)![1];
  const report = JSON.parse(Buffer.from(json, 'latin1').toString('utf8'));
  expect(report).toMatchObject({
    title: 'Invoice total shows NaN when a credit note is applied',
    type: 'bug',
    severity: 'high',
    description: 'Balance of INV-2041 is NaN.',
    screenshots: [{ name: 'screenshot-1.png' }],
    attachments: [{ name: 'steps.txt', type: 'text/plain', size: 16 }],
    context: { route: '/invoices', user: 'qa.tester@ledgerline.test', build: 'web 4.18.2 · a1c9e07', custom: { tenant: 'acme-eu' } },
  });
  expect(report.context.console.some((e: { message: string }) => e.message.includes('TypeError'))).toBe(true);
  expect(report.context.network).toContainEqual(expect.objectContaining({ url: '/api/credit-notes/CN-2041', status: 404, failed: true }));
  expect(raw).toContain('name="screenshots"; filename="screenshot-1.png"\r\nContent-Type: image/png\r\n\r\n\x89PNG');
  expect(raw).toContain('name="attachments"; filename="steps.txt"');
});

test('leaves page details out when they are switched off', async ({ page }) => {
  await openPanel(page);
  const dialog = page.getByRole('dialog', { name: 'Report a bug' });
  await dialog.getByLabel('Title').fill('Something');
  await dialog.getByText('Page details included').click();
  await dialog.locator('#bb-ctx-user').uncheck();
  await dialog.locator('#bb-ctx-console').uncheck();

  const request = page.waitForRequest('**/api/bug-reports');
  await page.route('**/api/bug-reports', (route) => route.fulfill({ status: 201, json: {} }));
  await dialog.getByRole('button', { name: 'Send report' }).click();
  const raw = (await request).postDataBuffer()!.toString('utf8');
  const report = JSON.parse(raw.match(/Content-Type: application\/json\r\n\r\n(.*?)\r\n--/s)![1]);
  expect(report.context.user).toBeUndefined();
  expect(report.context.console).toBeUndefined();
  expect(report.context.network).toBeDefined();
  await expect(dialog.getByText('Report sent')).toBeVisible();
});

test('requires a title and shows send errors', async ({ page }) => {
  await openPanel(page);
  const dialog = page.getByRole('dialog', { name: 'Report a bug' });
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(dialog.getByText('Add a short title')).toBeVisible();

  await dialog.getByLabel('Title').fill('Broken');
  await page.route('**/api/bug-reports', (route) => route.fulfill({ status: 502, body: 'Jira is down' }));
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('The bug report service answered 502: Jira is down');
  await expect(dialog.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('redacts password and marked fields in screenshots', async ({ page }) => {
  await page.goto('/settings');
  await page.keyboard.press('Control+Shift+B');
  const dialog = page.getByRole('dialog', { name: 'Report a bug' });
  await dialog.getByRole('button', { name: 'Whole screen' }).click();
  await dialog.getByRole('button', { name: /Open Screen/ }).click();
  await expect(dialog.locator('canvas')).toBeVisible();

  const password = (await page.locator('input[type=password]').boundingBox())!;
  const apiKey = (await page.locator('[data-bb-redact]').boundingBox())!;
  const name = (await page.locator('input:not([type])').first().boundingBox())!;
  expect(await brightness(page, password)).toBeLessThan(40);
  expect(await brightness(page, apiKey)).toBeLessThan(40);
  expect(await brightness(page, name)).toBeGreaterThan(150);
});

test('keeps the draft when minimised and after a reload', async ({ page }) => {
  await openPanel(page);
  const dialog = page.getByRole('dialog', { name: 'Report a bug' });
  await dialog.getByLabel('Title').fill('Draft title');
  await dialog.getByRole('button', { name: /Minimise/ }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await page.keyboard.press('Control+Shift+B');
  await expect(page.getByRole('dialog', { name: 'Report a bug' }).getByLabel('Title')).toHaveValue('Draft title');
});
