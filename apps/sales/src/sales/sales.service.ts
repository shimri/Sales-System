import { Inject, Injectable, Logger, OnModuleInit, NotFoundException, BadRequestException } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { DataSource, Repository } from 'typeorm';
import { lastValueFrom, timeout } from 'rxjs';
import { CorrelationIdService } from '../correlation-id/correlation-id.service';
import { Order, OrderStatus } from '../order/entity/order.entity';
import { EventValidator } from '../validator/event.validator';
import { InventoryService } from '../inventory/inventory.service';
import { OrderCreationInProgressException } from '../order/exceptions/order-creation-in-progress.exception';

@Injectable()
export class SalesService implements OnModuleInit {
  private readonly logger = new Logger(SalesService.name);

  private readonly IDEMPOTENCY_LOCK_TTL = 300; // 5 minutes lock expiry
  private readonly DB_RETRY_MAX_ATTEMPTS = 3;
  private readonly DB_RETRY_BASE_DELAY_MS = 100;
  private readonly KAFKA_EMIT_TIMEOUT_MS = 5000;
  private readonly EVENT_IDEMPOTENCY_TTL = 86400; // 24 hours for event deduplication

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @Inject('DELIVERY_SERVICE') private readonly deliveryClient: ClientKafka,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly correlationIdService: CorrelationIdService,
    private readonly eventValidator: EventValidator,
    private readonly inventoryService: InventoryService,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    this.deliveryClient.subscribeToResponseOf('order-events');
    await this.connectWithRetry();
  }

  private async connectWithRetry(maxRetries = 10, delay = 2000): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.deliveryClient.connect();
        this.logger.log('Successfully connected to Kafka');
        return;
      } catch (error) {
        if (attempt === maxRetries) {
          this.logger.error(
            `Failed to connect to Kafka after ${maxRetries} attempts: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          throw error;
        }
        this.logger.warn(
          `Kafka connection attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.5, 10000); // Exponential backoff, max 10s
      }
    }
  }

  async createOrder(orderData: any) {
    const { userId, items, amount, idempotencyKey } = orderData;

    // Atomic idempotency check with lock
    const cachedOrder = await this.acquireIdempotencyLock(idempotencyKey);
    if (cachedOrder) {
      return cachedOrder;
    }

    // Get or generate correlation ID
    const correlationId = this.getOrGenerateCorrelationId();

    // Validate order data before saving
    await this.validateOrderData(userId, items, amount, correlationId);

    // Check product availability before confirming order
    await this.inventoryService.checkOrderItemsAvailability(items);

    // Persist order and emit event directly to Kafka
    const savedOrder = await this.persistOrderAndEmitEvent(
      userId,
      items,
      amount,
      correlationId,
    );

    // Cache for idempotency (non-blocking)
    await this.cacheForIdempotency(idempotencyKey, savedOrder);

    return savedOrder;
  }

  /**
   * Atomically acquire idempotency lock using SET NX pattern
   * Returns cached order if exists, null if lock acquired
   */
  private async acquireIdempotencyLock(
    idempotencyKey: string,
  ): Promise<Order | null> {
    const lockKey = `order:lock:${idempotencyKey}`;
    const cacheKey = `order:${idempotencyKey}`;
    const lockValue = randomUUID(); // Unique value to safely unlock

    // Check if order already exists
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.log(`Order ${idempotencyKey} already exists, returning cached order`);
      return JSON.parse(cached);
    }

    // Try to acquire lock atomically
    const lockAcquired = await this.redis.set(
      lockKey,
      lockValue,
      'EX',
      this.IDEMPOTENCY_LOCK_TTL,
      'NX',
    );

    if (!lockAcquired) {
      // Another request is processing, wait briefly and check cache
      await new Promise((resolve) => setTimeout(resolve, 100));
      const retryCached = await this.redis.get(cacheKey);
      if (retryCached) {
        this.logger.log(`Order ${idempotencyKey} created by concurrent request`);
        return JSON.parse(retryCached);
      }
      // Still processing, throw exception with proper HTTP status code
      this.logger.warn(
        `Order creation already in progress for idempotency key: ${idempotencyKey}`,
      );
      throw new OrderCreationInProgressException(idempotencyKey);
    }

    // Lock acquired, return null to proceed with order creation
    return null;
  }

  /**
   * Get correlation ID or generate new UUID if missing
   */
  private getOrGenerateCorrelationId(): string {
    let correlationId = this.correlationIdService.getCorrelationId();

    if (!correlationId) {
      correlationId = randomUUID();
      this.logger.warn(
        `Missing correlation ID in request context, generated new UUID: ${correlationId}`,
      );
    }

    return correlationId;
  }

  /**
   * Validate order data before persistence
   */
  private async validateOrderData(
    userId: string,
    items: any[],
    amount: number,
    correlationId: string,
  ): Promise<void> {
    const tempEventPayload = {
      userId,
      items,
      amount,
      timestamp: new Date().toISOString(),
      correlationId,
    };

    await this.eventValidator.validateOrderEvent(tempEventPayload);
  }

  /**
   * Persist order in a transaction and emit event directly to Kafka
   */
  private async persistOrderAndEmitEvent(
    userId: string,
    items: any[],
    amount: number,
    correlationId: string,
  ): Promise<Order> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create order
      const order = this.orderRepository.create({
        userId,
        items,
        amount,
        status: OrderStatus.PendingShipment,
      });

      // Save order with retry
      const savedOrder = await this.withRetry(
        () => queryRunner.manager.save(Order, order),
        'save order',
      );

      // Commit transaction first
      await queryRunner.commitTransaction();
      this.logger.log(`Successfully saved order ${savedOrder.id}`);

      // Create event payload
      const eventPayload = {
        orderId: savedOrder.id,
        userId,
        items,
        amount,
        timestamp: new Date().toISOString(),
        correlationId,
      };

      // Send event directly to Kafka after transaction commit
      try {
        await lastValueFrom(
          this.deliveryClient.emit('order-events', eventPayload).pipe(
            timeout(this.KAFKA_EMIT_TIMEOUT_MS),
          ),
        );
        this.logger.log(`Successfully published order event for order ${savedOrder.id}`);
      } catch (kafkaError) {
        // Log error but don't block order creation
        this.logger.error(
          `Failed to publish order event for order ${savedOrder.id}: ${
            kafkaError instanceof Error ? kafkaError.message : String(kafkaError)
          }`,
          kafkaError instanceof Error ? kafkaError.stack : undefined,
        );
      }

      return savedOrder;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to persist order: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Cache order for idempotency (non-blocking)
   */
  private async cacheForIdempotency(
    idempotencyKey: string,
    order: Order,
  ): Promise<void> {
    try {
      await this.redis.set(
        `order:${idempotencyKey}`,
        JSON.stringify(order),
        'EX',
        3600, // 1 hour expiration
      );
      this.logger.log(`Successfully cached order ${order.id} for idempotency`);

      // Release lock
      await this.redis.del(`order:lock:${idempotencyKey}`);
    } catch (error) {
      // Cache failure should not block order creation
      this.logger.warn(
        `Failed to cache order ${order.id} for idempotency: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Retry wrapper for transient database errors
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    let lastError: Error | unknown;

    for (let attempt = 1; attempt <= this.DB_RETRY_MAX_ATTEMPTS; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Check if error is retriable (transient DB errors)
        if (!this.isRetriableError(error)) {
          throw error;
        }

        if (attempt === this.DB_RETRY_MAX_ATTEMPTS) {
          this.logger.error(
            `Failed ${operationName} after ${this.DB_RETRY_MAX_ATTEMPTS} attempts`,
          );
          throw error;
        }

        const delay = this.DB_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        this.logger.warn(
          `${operationName} attempt ${attempt}/${this.DB_RETRY_MAX_ATTEMPTS} failed, retrying in ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Check if error is retriable (transient database errors)
   */
  private isRetriableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const errorMessage = error.message.toLowerCase();
    const retriablePatterns = [
      'connection',
      'timeout',
      'econnreset',
      'epipe',
      'etimedout',
      'deadlock',
      'lock wait timeout',
      'serialization failure',
      'could not serialize',
    ];

    return retriablePatterns.some((pattern) => errorMessage.includes(pattern));
  }

  /**
   * Map delivery status to order status
   */
  private mapDeliveryStatusToOrderStatus(deliveryStatus: string): OrderStatus {
    const statusMap: Record<string, OrderStatus> = {
      'Pending': OrderStatus.PendingShipment,
      'Shipped': OrderStatus.Shipped,
      'Delivered': OrderStatus.Delivered,
      'Cancelled': OrderStatus.Cancelled,
    };

    const mappedStatus = statusMap[deliveryStatus];
    if (!mappedStatus) {
      throw new BadRequestException(
        `Invalid delivery status: ${deliveryStatus}. Valid statuses are: Pending, Shipped, Delivered, Cancelled`,
      );
    }

    return mappedStatus;
  }

  async updateOrderStatus(data: any) {
    const { orderId, status: deliveryStatus, correlationId } = data;
    
    this.logger.log(`Updating order ${orderId} with delivery status: ${deliveryStatus}`);

    // Validate order exists
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      this.logger.error(`Order ${orderId} not found`);
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    // Map delivery status to order status
    let orderStatus: OrderStatus;
    try {
      orderStatus = this.mapDeliveryStatusToOrderStatus(deliveryStatus);
    } catch (error) {
      this.logger.error(
        `Failed to map delivery status ${deliveryStatus} for order ${orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }

    // Idempotency check: Check if order is already in target status
    if (order.status === orderStatus) {
      this.logger.log(
        `Order ${orderId} is already in status ${orderStatus}, skipping duplicate status update`,
      );
      return order;
    }

    // Idempotency check: Check if this event was already processed
    const eventKey = this.getEventIdempotencyKey(orderId, deliveryStatus, correlationId);
    const isProcessed = await this.isEventAlreadyProcessed(eventKey);
    if (isProcessed) {
      this.logger.log(
        `Event already processed for order ${orderId}, status ${deliveryStatus}, correlationId ${correlationId}. Skipping duplicate event.`,
      );
      // Return the order with current status (may have been updated by another instance)
      return await this.orderRepository.findOne({ where: { id: orderId } });
    }

    // Update order status in a transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Double-check status within transaction to handle race conditions
      const orderInTx = await queryRunner.manager.findOne(Order, {
        where: { id: orderId },
      });

      if (!orderInTx) {
        throw new NotFoundException(`Order with ID ${orderId} not found`);
      }

      if (orderInTx.status === orderStatus) {
        await queryRunner.rollbackTransaction();
        this.logger.log(
          `Order ${orderId} is already in status ${orderStatus} (detected in transaction), skipping update`,
        );
        return orderInTx;
      }

      orderInTx.status = orderStatus;
      await queryRunner.manager.save(Order, orderInTx);
      await queryRunner.commitTransaction();
      
      this.logger.log(`Order ${orderId} updated to ${orderStatus}`);

      // Mark event as processed after successful update
      await this.markEventAsProcessed(eventKey);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to update order ${orderId} status: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Generate composite key for event idempotency tracking
   */
  private getEventIdempotencyKey(
    orderId: string,
    status: string,
    correlationId: string,
  ): string {
    return `event:delivery:${orderId}:${status}:${correlationId}`;
  }

  /**
   * Check if event was already processed (with graceful degradation)
   */
  private async isEventAlreadyProcessed(eventKey: string): Promise<boolean> {
    try {
      const processed = await this.redis.get(eventKey);
      if (processed) {
        this.logger.log(`Event already processed: ${eventKey}`);
        return true;
      }
      return false;
    } catch (error) {
      // Graceful degradation: if Redis is unavailable, log warning and continue
      this.logger.warn(
        `Redis unavailable for idempotency check (${eventKey}): ${
          error instanceof Error ? error.message : String(error)
        }. Continuing with status-only check.`,
      );
      return false;
    }
  }

  /**
   * Mark event as processed in Redis (non-blocking)
   */
  private async markEventAsProcessed(eventKey: string): Promise<void> {
    try {
      await this.redis.set(eventKey, '1', 'EX', this.EVENT_IDEMPOTENCY_TTL);
      this.logger.log(`Marked event as processed: ${eventKey}`);
    } catch (error) {
      // Non-blocking: log warning but don't fail the operation
      this.logger.warn(
        `Failed to mark event as processed in Redis (${eventKey}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
