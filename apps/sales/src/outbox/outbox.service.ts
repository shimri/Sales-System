import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Outbox, OutboxStatus } from './outbox.entity';
import { ClientKafka } from '@nestjs/microservices';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  private readonly MAX_RETRIES = 5;
  private readonly RETRY_DELAY_MS = 1000; // 1 second base delay

  constructor(
    @InjectRepository(Outbox)
    private readonly outboxRepository: Repository<Outbox>,
    @Inject('DELIVERY_SERVICE') private readonly deliveryClient: ClientKafka,
  ) {}

  /**
   * Save an event to the outbox when Kafka publish fails
   */
  async saveToOutbox(eventType: string, payload: any, error?: string): Promise<Outbox> {
    const outbox = this.outboxRepository.create({
      eventType,
      payload,
      status: OutboxStatus.Pending,
      retryCount: 0,
      lastError: error,
    });

    return await this.outboxRepository.save(outbox);
  }

  /**
   * Retry publishing events from the outbox
   */
  async processOutboxEvents(): Promise<void> {
    // Get pending events that haven't exceeded max retries
    const pendingEvents = await this.outboxRepository.find({
      where: {
        status: OutboxStatus.Pending,
        retryCount: LessThan(this.MAX_RETRIES),
      },
      order: {
        createdAt: 'ASC',
      },
      take: 10, // Process 10 events at a time
    });

    if (pendingEvents.length === 0) {
      return;
    }

    this.logger.log(`Processing ${pendingEvents.length} outbox events`);

    for (const event of pendingEvents) {
      try {
        // Mark as processing
        event.status = OutboxStatus.Processing;
        await this.outboxRepository.save(event);

        // Attempt to publish to Kafka
        this.deliveryClient.emit(event.eventType, event.payload);

        // Mark as completed
        event.status = OutboxStatus.Completed;
        event.processedAt = new Date();
        event.lastError = '';
        await this.outboxRepository.save(event);

        this.logger.log(`Successfully published outbox event ${event.id}`);
      } catch (error) {
        // Increment retry count
        event.retryCount += 1;
        event.status = OutboxStatus.Pending;
        event.lastError = error instanceof Error ? error.message : String(error);

        if (event.retryCount >= this.MAX_RETRIES) {
          event.status = OutboxStatus.Failed;
          this.logger.error(
            `Outbox event ${event.id} failed after ${this.MAX_RETRIES} retries`,
          );
        }

        await this.outboxRepository.save(event);
        this.logger.warn(
          `Failed to publish outbox event ${event.id}, retry ${event.retryCount}/${this.MAX_RETRIES}`,
        );
      }
    }
  }

  /**
   * Get exponential backoff delay based on retry count
   */
  private getRetryDelay(retryCount: number): number {
    return this.RETRY_DELAY_MS * Math.pow(2, retryCount);
  }
}

