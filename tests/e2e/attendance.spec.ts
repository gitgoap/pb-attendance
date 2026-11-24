import { test, expect } from '@playwright/test';
import { openAdminDemo } from './auth';
test('login and attendance fit a narrow phone with readable work-time records', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome to PB' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/login-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Staff demo', exact: true }).click();
  const table = page.locator('.attendance-table');
  const firstWorkTime = table.locator('.work-time').first();
  await firstWorkTime.scrollIntoViewIfNeeded();
  const box = await firstWorkTime.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  expect(await table.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/staff-narrow.png', fullPage: true });
});
test('staff can mark a shift and lunch, with undecided payable hours clearly labelled', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Staff demo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Rahul' })).toBeVisible();
  await expect(page.getByText('Automatic lunch deductions are off.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Check in', exact: true }).click();
  await expect(page.getByText('Check-in recorded.')).toBeVisible();
  await page.getByRole('button', { name: 'Start unpaid break' }).click();
  await expect(
    page.locator('.attendance-card').getByText('On break', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check out', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'End break' }).click();
  await page.getByRole('button', { name: 'Check out', exact: true }).click();
  await expect(page.getByText('Check-out recorded.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check in', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Check in', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/staff-mobile.png', fullPage: true });
});
test('admin corrects missed arrival and lunch, edits staff and sees the audit record', async ({
  page,
}) => {
  const auth = await openAdminDemo(page);
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Attendance', exact: true }).click();
  await page.getByRole('button', { name: 'Add attendance', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Staff member').selectOption('22222222-2222-4222-8222-222222222222');
  await dialog.getByLabel('Attendance date').fill('2026-10-20');
  await dialog.getByLabel('Check-in · IST').fill('2026-10-20T09:00');
  await dialog.getByLabel('Check-out · IST').fill('2026-10-20T18:00');
  await dialog.getByLabel('Total unpaid break').fill('90');
  await dialog
    .getByLabel('Reason for this correction')
    .fill('Forgot check in; supervisor confirmed 90 minute lunch');
  await dialog.getByRole('button', { name: 'Save attendance correction' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel('Month', { exact: true }).fill('2026-10');
  await expect(page.getByText('7h 30m', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Staff members', exact: true }).click();
  await page
    .locator('.staff-card')
    .filter({ hasText: 'Rahul Kumar' })
    .getByRole('button', { name: 'Edit details' })
    .click();
  await dialog.getByLabel('Full name').fill('Rahul Kumar Singh');
  await dialog.getByLabel('Reason for change').fill('Updated full employee name');
  await dialog.getByRole('button', { name: 'Save staff details' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rahul Kumar Singh' })).toBeVisible();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Change history', exact: true }).click();
  await expect(page.getByText('Updated full employee name', { exact: true })).toBeVisible();
  await page.getByRole('button').filter({ hasText: 'Forgot check in; supervisor' }).click();
  await expect(dialog.getByRole('cell', { name: '90', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.screenshot({ path: 'test-results/admin-desktop.png', fullPage: true });
  expect(auth.writes).toBe(0);
});
test('lunch remains undecided until admin explicitly configures a policy', async ({ page }) => {
  await openAdminDemo(page);
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Shop settings', exact: true }).click();
  await expect(page.getByLabel('How should lunch be handled?')).toHaveValue('pending');
  await expect(page.getByLabel('Latitude', { exact: true })).toHaveValue('23.38102667646155');
  await page.getByLabel('How should lunch be handled?').selectOption('fixed');
  await page.getByLabel('Agreed unpaid lunch').fill('90');
  await page.getByLabel('Reason for these settings').fill('Agreed 90 minute lunch policy');
  await page.getByRole('button', { name: 'Save shop settings' }).click();
  await expect(page.getByText('Shop settings saved.')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Shop settings', exact: true }).click();
  await expect(page.getByLabel('Agreed unpaid lunch')).toHaveValue('90');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
