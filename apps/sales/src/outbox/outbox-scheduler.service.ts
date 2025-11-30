import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { OutboxService } from './outbox.service';

@Injectable()
export class OutboxSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxSchedulerService.name);
  private intervalId: NodeJS.Timeout | null = null;
  private readonly RETRY_INTERVAL_MS = 5000; // Retry every 5 seconds

  constructor(private readonly outboxService: OutboxService) {}

  onModuleInit() {
    this.logger.log('Starting outbox scheduler');
    // Start processing outbox events periodically
    this.intervalId = setInterval(() => {
      this.outboxService.processOutboxEvents().catch((error) => {
        this.logger.error(`Error processing outbox events: ${error.message}`, error.stack);
      });
    }, this.RETRY_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.logger.log('Stopped outbox scheduler');
    }
  }
}

