import { Injectable, Scope } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

@Injectable({ scope: Scope.DEFAULT })
export class CorrelationIdService {
  private readonly asyncLocalStorage = new AsyncLocalStorage<string>();

  setCorrelationId(correlationId: string): void {
    this.asyncLocalStorage.enterWith(correlationId);
  }

  getCorrelationId(): string | undefined {
    return this.asyncLocalStorage.getStore();
  }

  runWithCorrelationId<T>(correlationId: string, callback: () => T): T {
    return this.asyncLocalStorage.run(correlationId, callback);
  }
}

