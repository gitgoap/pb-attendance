import { test, expect } from '@playwright/test';
import { mockAuthentication, openAdminDemo, signIn } from './auth';

test('login and public staff demo have no admin demo entry', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Admin demo', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Staff demo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Rahul' })).toBeVisible();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('button', { name: 'Admin demo', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try admin view' })).toHaveCount(0);
});

test('forging an old admin demo session cannot bypass sign-in', async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem('pb-attendance-demo-actor', '11111111-1111-4111-8111-111111111111'),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome to PB' })).toBeVisible();
  await expect(page.locator('.demo-banner')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('pb-attendance-demo-actor'))).toBeNull();
});

test('signed-in staff cannot open a stored admin demo', async ({ page }) => {
  await mockAuthentication(page, 'staff');
  await signIn(page);
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('button', { name: 'Admin demo', exact: true })).toHaveCount(0);
  await page.evaluate(() =>
    sessionStorage.setItem('pb-attendance-demo-actor', '11111111-1111-4111-8111-111111111111'),
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hello, Demo' })).toBeVisible();
  await expect(page.locator('.demo-banner')).toHaveCount(0);
});

test('an authenticated admin can preview, return, and sign out safely', async ({ page }) => {
  const auth = await openAdminDemo(page);
  await page.reload();
  await expect(page.locator('.demo-banner')).toContainText('admin workspace');
  await page.getByRole('button', { name: 'Return to admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Demo' })).toBeVisible();
  await expect(page.locator('.demo-banner')).toHaveCount(0);
  expect(auth.signedIn).toBe(true);
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Admin demo', exact: true }).click();
  await expect(page.locator('.demo-banner')).toBeVisible();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to PB' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome to PB' })).toBeVisible();
  expect(auth.signedIn).toBe(false);
  expect(auth.writes).toBe(0);
});

test('losing the active admin role closes the admin demo', async ({ page }) => {
  const auth = await openAdminDemo(page);
  auth.active = false;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to PB' })).toBeVisible();
  await expect(page.locator('.demo-banner')).toHaveCount(0);
});
