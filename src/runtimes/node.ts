import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { NodeAssetsAdapter } from '../infrastructure/assets/node';
import { parseNodeConfig } from '../infrastructure/config/node';
import { SqliteDatabaseAdapter } from '../infrastructure/database/sqlite/adapter';
import { applySqliteMigrations } from '../infrastructure/database/sqlite/migrations';
import { NodeScheduler } from '../infrastructure/scheduler/node';
import { ensureDatabase } from '../lib/db';
import { syncRuleSources } from '../lib/sync';
import { createApp } from '../server/app';
import type { Env } from '../types';
import { APP_VERSION } from '../version';

const config = parseNodeConfig(process.env);
await mkdir(dirname(config.databasePath), { recursive: true });
const database = new SqliteDatabaseAdapter(config.databasePath);
await applySqliteMigrations(database, resolve(process.cwd(), 'migrations'));
const env: Env = {
  DB: database,
  ASSETS: new NodeAssetsAdapter(resolve(process.cwd(), 'dist/client')),
  ADMIN_PASSWORD: config.adminPassword,
  SESSION_SECRET: config.sessionSecret,
  RULE_TOKEN: config.ruleToken,
  BASE_URL: config.baseUrl,
  TRUST_PROXY: config.trustProxy,
  RUNTIME: 'node',
  APP_VERSION,
};
await ensureDatabase(env);
const app = createApp();
const logger = {
  info: (message: string) => console.info(`[private-rules] ${message}`),
  error: (message: string, error?: unknown) => console.error(`[private-rules] ${message}`, error instanceof Error ? error.message : ''),
};
const scheduler = new NodeScheduler(config.scheduler.intervalSeconds, () => syncRuleSources(env, undefined, false), logger);
if (config.scheduler.enabled) scheduler.start();
const server = serve({ hostname: config.host, port: config.port, fetch: (request) => app.fetch(request, env) }, (info) => logger.info(`listening on http://${info.address}:${info.port}`));

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info(`received ${signal}; shutting down`);
  scheduler.stop();
  server.close(() => { database.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
