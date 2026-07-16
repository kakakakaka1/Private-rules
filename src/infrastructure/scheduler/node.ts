export interface SchedulerLogger { info(message: string): void; error(message: string, error?: unknown): void }

export class NodeScheduler {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private readonly intervalSeconds: number, private readonly task: () => Promise<unknown>, private readonly logger: SchedulerLogger) {}
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalSeconds * 1000);
    this.timer.unref?.();
    this.logger.info(`scheduler enabled; scanning every ${this.intervalSeconds}s`);
  }
  private async tick() {
    if (this.running) return;
    this.running = true;
    try { await this.task(); } catch (error) { this.logger.error('scheduler scan failed', error); }
    finally { this.running = false; }
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
}
