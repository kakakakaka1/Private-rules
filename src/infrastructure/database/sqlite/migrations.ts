import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SqliteDatabaseAdapter } from './adapter';

export async function applySqliteMigrations(database: SqliteDatabaseAdapter, directory: string) {
  database.native.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const files = (await readdir(directory)).filter((file) => /^\d+.*\.sql$/.test(file)).sort();
  const applied = new Set((database.native.prepare('SELECT version FROM _migrations').all() as Array<{ version: string }>).map((row) => row.version));
  const migrate = database.native.transaction((version: string, sql: string) => {
    database.native.exec(sql);
    database.native.prepare('INSERT INTO _migrations (version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString());
  });
  for (const file of files) {
    if (applied.has(file)) continue;
    migrate(file, await readFile(join(directory, file), 'utf8'));
  }
  return files.length;
}
