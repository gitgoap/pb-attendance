import { expect, type Page } from '@playwright/test';
import { initialSettings } from '../../src/domain';

export async function mockAuthentication(page: Page, role: 'admin' | 'staff' = 'admin') {
  const state = { role, active: true, signedIn: false, writes: 0 };
  const id = '99999999-9999-4999-8999-999999999999';
  const user = {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'owner@pb.example',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  };
  const profile = () => ({
    id,
    staff_code: 'OWNER',
    full_name: 'Demo Owner',
    phone: '',
    department: 'Management',
    role: state.role,
    active: state.active,
    version: 1,
  });
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, aud: 'authenticated', role: 'authenticated', exp: expires, iat: expires - 3600 })}.dGVzdA`;
  await page.route('https://pb-attendance-test.supabase.co/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'content-type': 'application/json',
    };
    const respond = (body: unknown, status = 200) =>
      route.fulfill({ status, headers, body: JSON.stringify(body) });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname === '/auth/v1/token') {
      state.signedIn = true;
      return respond({
        access_token: token,
        refresh_token: 'browser-test-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: expires,
        user,
      });
    }
    if (url.pathname === '/auth/v1/user')
      return state.signedIn
        ? respond(user)
        : respond({ message: 'Session expired', code: 'bad_jwt' }, 401);
    if (url.pathname === '/auth/v1/logout') {
      state.signedIn = false;
      return respond({});
    }
    if (request.method() !== 'GET') {
      state.writes++;
      return respond({ message: 'Unexpected live write from a demo' }, 400);
    }
    if (!state.signedIn) return respond({ message: 'Not authenticated' }, 401);
    if (url.pathname === '/rest/v1/pb_staff')
      return respond(
        url.searchParams.get('select') === 'role,active'
          ? { role: state.role, active: state.active }
          : [profile()],
      );
    if (url.pathname === '/rest/v1/pb_settings') return respond(initialSettings);
    if (url.pathname === '/rest/v1/pb_attendance_summary' || url.pathname === '/rest/v1/pb_audit')
      return respond([]);
    return respond({ message: 'Unexpected API request' }, 404);
  });
  return state;
}

export async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email address').fill('owner@pb.example');
  await page.getByLabel('Password', { exact: true }).fill('Browser-test-password-123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Demo' })).toBeVisible();
}

export async function openAdminDemo(page: Page) {
  const state = await mockAuthentication(page);
  await signIn(page);
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Admin demo', exact: true }).click();
  await expect(page.locator('.demo-banner')).toContainText('admin workspace');
  return state;
}
