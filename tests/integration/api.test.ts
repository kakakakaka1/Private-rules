import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SqliteDatabaseAdapter } from '../../src/infrastructure/database/sqlite/adapter';
import { applySqliteMigrations } from '../../src/infrastructure/database/sqlite/migrations';
import { addRule, createCategory } from '../../src/lib/db';
import { createApp } from '../../src/server/app';
import type { Env } from '../../src/types';

describe('HTTP API behavior', () => {
  let directory: string; let database: SqliteDatabaseAdapter; let env: Env; let cookie = '';
  const app = createApp();
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'private-rules-api-'));
    database = new SqliteDatabaseAdapter(join(directory, 'api.db'));
    await applySqliteMigrations(database, resolve(process.cwd(), 'migrations'));
    env = { DB: database, ASSETS: { fetch: async () => new Response('<html>admin</html>', { headers: { 'content-type': 'text/html' } }) }, ADMIN_PASSWORD: 'correct-password', SESSION_SECRET: '0123456789abcdef0123456789abcdef', RULE_TOKEN: 'private-token', RUNTIME: 'node' };
    let data = await createCategory(env, { name: 'public-rule', tokenLinksEnabled: false, publicLinksEnabled: true });
    await addRule(env, data.categories[0].id, { value: 'public.example' });
    data = await createCategory(env, { name: 'private-rule', tokenLinksEnabled: true, publicLinksEnabled: false });
    await addRule(env, data.categories.find((item) => item.name === 'private-rule')!.id, { value: 'private.example' });
    data = await createCategory(env, { name: 'disabled-rule', tokenLinksEnabled: false, publicLinksEnabled: false });
    await addRule(env, data.categories.find((item) => item.name === 'disabled-rule')!.id, { value: 'disabled.example' });
  });
  afterAll(async () => { database.close(); await rm(directory, { recursive: true, force: true }); });
  const request = (path: string, init: RequestInit = {}) => app.request(path, { ...init, headers: { ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) } }, env);

  it('handles failed login, session login, authenticated API, and logout', async () => {
    expect((await request('/api/categories')).status).toBe(401);
    expect((await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'wrong' }) })).status).toBe(401);
    const login = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'correct-password' }) });
    expect(login.status).toBe(200);
    cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect(cookie).toContain('private_rules_session=');
    expect((await request('/api/categories')).status).toBe(200);
    expect((await request('/admin')).status).toBe(200);
    expect((await request('/api/auth/logout', { method: 'POST' })).status).toBe(200);
    cookie = '';
    expect((await request('/api/categories')).status).toBe(401);
  });

  it('preserves public, token, disabled, missing, and four-format subscription behavior', async () => {
    for (const extension of ['yaml', 'list', 'txt', 'json']) {
      const response = await request(`/rules/public-rule.${extension}`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('public.example');
    }
    expect((await request('/rules/private-rule.yaml')).status).toBe(404);
    expect((await request('/sub/wrong/private-rule.yaml')).status).toBe(404);
    expect((await request('/sub/private-token/private-rule.yaml')).status).toBe(200);
    expect((await request('/rules/disabled-rule.yaml')).status).toBe(404);
    expect((await request('/sub/private-token/disabled-rule.yaml')).status).toBe(404);
    expect((await request('/rules/missing.yaml')).status).toBe(404);
  });

  it('trusts forwarded HTTPS only when explicitly configured', async () => {
    env.TRUST_PROXY = true;
    const trusted = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https' }, body: JSON.stringify({ password: 'correct-password' }) });
    expect(trusted.headers.get('set-cookie')).toContain('Secure');
    env.TRUST_PROXY = false;
    const untrusted = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https' }, body: JSON.stringify({ password: 'correct-password' }) });
    expect(untrusted.headers.get('set-cookie')).not.toContain('Secure');
  });
});
