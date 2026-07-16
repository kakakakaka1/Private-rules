import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodeScheduler } from '../../src/infrastructure/scheduler/node';
afterEach(() => vi.useRealTimers());
describe('NodeScheduler', () => {
  it('does not run at startup and prevents overlapping scans', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const task = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const scheduler = new NodeScheduler(60, task, { info: vi.fn(), error: vi.fn() });
    scheduler.start();
    expect(task).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(task).toHaveBeenCalledOnce();
    release();
    await Promise.resolve();
    scheduler.stop();
  });
});
