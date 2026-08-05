type State = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold: number;
  resetTimeoutMs: number;
}

export class CircuitBreaker {
  private state: State = 'closed';
  private failures = 0;
  private lastFailure = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.options.resetTimeoutMs) {
        this.state = 'half_open';
      } else {
        throw new CircuitOpenError(this.options.name);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === 'half_open') {
      this.state = 'closed';
      console.log(`[circuit:${this.options.name}] CLOSED — recuperado`);
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.options.failureThreshold && this.state !== 'open') {
      this.state = 'open';
      console.warn(`[circuit:${this.options.name}] OPEN — ${this.failures} falhas consecutivas`);
    }
  }

  getState(): State { return this.state; }
  isAvailable(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'open' && Date.now() - this.lastFailure > this.options.resetTimeoutMs) return true;
    return false;
  }
}

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker [${name}] está OPEN`);
    this.name = 'CircuitOpenError';
  }
}
