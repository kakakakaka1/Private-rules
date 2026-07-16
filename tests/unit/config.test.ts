import { describe, expect, it } from 'vitest';
import { parseNodeConfig } from '../../src/infrastructure/config/node';
const valid = { ADMIN_PASSWORD: 'password', SESSION_SECRET: '0123456789abcdef0123456789abcdef' };
describe('node configuration', () => {
  it('parses booleans without treating "false" as true and normalizes BASE_URL', () => {
    const config = parseNodeConfig({ ...valid, TRUST_PROXY: 'false', BASE_URL: 'https://example.com///' });
    expect(config.trustProxy).toBe(false);
    expect(config.baseUrl).toBe('https://example.com');
    expect(config.port).toBe(5173);
    expect(config.scheduler.intervalSeconds).toBe(60);
  });
  it('rejects unsafe production secrets and invalid ranges', () => {
    expect(() => parseNodeConfig({ ...valid, NODE_ENV: 'production', SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
    expect(() => parseNodeConfig({ ...valid, SCHEDULER_INTERVAL_SECONDS: '0' })).toThrow(/SCHEDULER_INTERVAL_SECONDS/);
    expect(() => parseNodeConfig({ ...valid, TRUST_PROXY: 'yes' })).toThrow(/TRUST_PROXY/);
  });
});
