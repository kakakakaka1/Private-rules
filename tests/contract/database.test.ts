import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { D1DatabaseAdapter } from '../../src/infrastructure/database/d1/adapter';
import { SqliteDatabaseAdapter } from '../../src/infrastructure/database/sqlite/adapter';
import { applySqliteMigrations } from '../../src/infrastructure/database/sqlite/migrations';
import { addRule, createCategory, deleteCategory, getRulesData, importRulesData, updateCategory } from '../../src/lib/db';
import type { Env } from '../../src/types';
import type { DatabasePort } from '../../src/application/ports/database';

const migrations = resolve(process.cwd(), 'migrations');
function contract(name: string, setup: () => Promise<{ database: DatabasePort; close: () => Promise<void> }>) {
  describe(name, () => {
    let env: Env; let database: DatabasePort; let close: () => Promise<void> = async () => {};
    beforeAll(async () => { const ready = await setup(); database = ready.database; env = { DB: ready.database, ASSETS: { fetch: async () => new Response() }, ADMIN_PASSWORD: 'pw', SESSION_SECRET: '0123456789abcdef0123456789abcdef', RULE_TOKEN: 'token' }; close = ready.close; });
    afterAll(async () => close());
    it('supports CRUD, uniqueness, access fields, sync metadata, backup and restore', async () => {
      let data = await createCategory(env, { name: `${name}-rules`, tokenLinksEnabled: true, publicLinksEnabled: false });
      const category = data.categories[0];
      data = await addRule(env, category.id, { value: 'example.com' });
      expect(data.categories[0].rules[0].value).toBe('example.com');
      data = await updateCategory(env, category.id, { tokenLinksEnabled: false, publicLinksEnabled: true });
      expect(data.categories[0]).toMatchObject({ tokenLinksEnabled: false, publicLinksEnabled: true });
      await expect(createCategory(env, { name: `${name}-rules` })).rejects.toThrow();
      const backup = await getRulesData(env);
      await deleteCategory(env, category.id);
      expect((await getRulesData(env)).categories).toHaveLength(0);
      const restored = await importRulesData(env, backup);
      expect(restored.categories[0].rules[0].value).toBe('example.com');
      expect(restored.meta?.ruleTokenConfigured).toBe(true);
    });
    it('rolls back a failed batch atomically', async () => {
      const timestamp = new Date().toISOString();
      await expect(database.batch([
        database.prepare('INSERT INTO categories (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind('tx-first', 'Tx first', 'tx-slug', timestamp, timestamp),
        database.prepare('INSERT INTO categories (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind('tx-second', 'Tx second', 'tx-slug', timestamp, timestamp),
      ])).rejects.toThrow();
      expect(await database.prepare('SELECT id FROM categories WHERE id = ?').bind('tx-first').first()).toBeNull();
    });
  });
}

contract('sqlite', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'private-rules-'));
  const database = new SqliteDatabaseAdapter(join(directory, 'test.db'));
  await applySqliteMigrations(database, migrations);
  return { database, close: async () => { database.close(); await rm(directory, { recursive: true, force: true }); } };
});

contract('d1', async () => {
  const miniflare = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("ok") } }', d1Databases: ['DB'] });
  const binding = await miniflare.getD1Database('DB');
  for (const file of (await readdir(migrations)).filter((value) => /^\d+.*\.sql$/.test(value)).sort()) {
    const sql = await readFile(join(migrations, file), 'utf8');
    for (const statement of sql.split(';').map((value) => value.trim()).filter(Boolean)) await binding.prepare(statement).run();
  }
  return { database: new D1DatabaseAdapter(binding), close: async () => miniflare.dispose() };
});
