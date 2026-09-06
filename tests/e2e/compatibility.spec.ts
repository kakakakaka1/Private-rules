import { expect, test, type Page } from '@playwright/test';

async function createCategory(page: Page) {
  await page.request.post('/api/auth/login', { data: { password: 'e2e-password' } });
  const name = `Compatibility-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const response = await page.request.post('/api/categories', { data: { name, tokenLinksEnabled: false, publicLinksEnabled: true } });
  expect(response.status()).toBe(201);
  const { data } = await response.json();
  return data.categories.find((category: { name: string }) => category.name === name) as { id: string; name: string };
}

for (const locale of ['zh-CN', 'zh-TW', 'en']) {
  test(`subscription groups, translations and Loon opt-in (${locale})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const category = await createCategory(page);
    await page.addInitScript((locale) => localStorage.setItem('private-rules-locale', locale), locale);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/admin?view=links&category=${category.id}`);
    const groups = page.locator('.subscription-format-group');
    await expect(groups).toHaveCount(4);
    await expect(page.locator('.format-link-card:visible')).toHaveCount(0);
    const yaml = page.locator('[data-format-group="yaml"]');
    await yaml.locator('summary').click();
    const ipTitle = locale === 'en' ? 'YAML · IP/Port' : locale === 'zh-TW' ? 'YAML · IP/連接埠' : 'YAML · IP/端口';
    await expect(yaml.getByRole('heading', { name: ipTitle, exact: true })).toBeVisible();
    const domainTitle = locale === 'en' ? 'YAML · Domain' : locale === 'zh-TW' ? 'YAML · 網域' : 'YAML · 域名';
    await expect(yaml.getByRole('heading', { name: domainTitle, exact: true })).toBeVisible();
    await expect(yaml.locator('code').filter({ hasText: '_Domain.yaml' })).toBeVisible();
    const list = page.locator('[data-format-group="list"]');
    await list.locator('summary').click();
    await expect(list.getByRole('heading', { name: 'Quantumult X', exact: true })).toBeVisible();
    const checkbox = list.getByRole('checkbox');
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await expect(list.locator('.format-file-name').first()).toHaveText(/-loon\.list$/);
    await expect(list.getByRole('checkbox')).toBeChecked();
    await list.getByRole('checkbox').uncheck();
    await expect(list.locator('.format-file-name').first()).not.toHaveText(/-loon\.list$/);
    if (locale === 'en') expect((await groups.allTextContents()).join(' ')).not.toMatch(/[\u3400-\u9fff]/u);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/subscriptions-${locale}.png`, fullPage: true });
    await page.request.delete(`/api/categories/${category.id}`);
  });
}

for (const viewport of [{ width: 390, height: 667 }, { width: 667, height: 375 }, { width: 320, height: 480 }]) {
  test(`bulk import remains scrollable with reachable actions at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const category = await createCategory(page);
    await page.addInitScript(() => localStorage.setItem('private-rules-locale', 'zh-CN'));
    await page.setViewportSize(viewport);
    await page.goto(`/admin?view=rules&category=${category.id}`);
    await page.locator('.bulk-card textarea').fill(Array.from({ length: 100 }, (_, i) => `mobile-${i}.example.com`).join('\n'));
    await page.getByRole('button', { name: '预览规则', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '批量导入预览' });
    const confirm = dialog.getByRole('button', { name: '确认导入 100 条', exact: true });
    await expect(confirm).toBeInViewport({ ratio: 1 });
    const content = dialog.locator('.bulk-preview-content');
    expect(await content.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await content.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect(dialog.getByText('mobile-99.example.com', { exact: true })).toBeInViewport();
    await expect(confirm).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: `test-results/bulk-${viewport.width}x${viewport.height}.png` });
    await confirm.click();
    await expect(dialog).toHaveCount(0);
    const result = await page.request.get('/api/categories');
    const payload = await result.json();
    expect(payload.data.categories.find((item: { id: string }) => item.id === category.id).ruleCount).toBe(100);
    await page.request.delete(`/api/categories/${category.id}`);
  });
}
