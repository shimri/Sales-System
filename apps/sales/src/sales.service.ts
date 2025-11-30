import { Inject, Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from './order/order.entity';
import { ClientKafka } from '@nestjs/microservices';
import Redis from 'ioredis';
import { CorrelationIdService } from './correlation-id/correlation-id.service';
import { EventValidator } from './validator/event.validator';
import { OutboxService } from './outbox/outbox.service';

@Injectable()
export class SalesService implements OnModuleInit {
  private readonly redis: Redis;
  private readonly logger = new Logger(SalesService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @Inject('DELIVERY_SERVICE') private readonly deliveryClient: ClientKafka,
    private readonly correlationIdService: CorrelationIdService,
    private readonly eventValidator: EventValidator,
    private readonly outboxService: OutboxService,
  ) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });
  }

  async onModuleInit() {
    this.deliveryClient.subscribeToResponseOf('order-events');
    await this.deliveryClient.connect();
  }

  async createOrder(orderData: any) {
    const { userId, items, amount, idempotencyKey } = orderData;

    // Idempotency Check
    const exists = await this.redis.get(`order:${idempotencyKey}`);
    if (exists) {
      return JSON.parse(exists);
    }

    // Create Order
    const order = this.orderRepository.create({
      userId,
      items,
      amount,
      status: OrderStatus.PendingShipment,
    });
    const savedOrder = await this.orderRepository.save(order);

    // Publish Event
    const correlationId = this.correlationIdService.getCorrelationId();
    const eventPayload = {
      orderId: savedOrder.id,
      userId,
      items,
      amount,
      timestamp: new Date().toISOString(),
      correlationId: correlationId || 'unknown',
    };

    // Validate event payload before publishing
    await this.eventValidator.validateOrderEvent(eventPayload);

    // Publish Event with Outbox Pattern
    // Note: emit() in NestJS Kafka client is fire-and-forget and may not throw synchronously
    // We'll attempt to publish, and if it fails, save to outbox for retry
    try {
      // Attempt to publish to Kafka
      this.deliveryClient.emit('order-events', eventPayload);
      this.logger.log(`Successfully published order event for order ${savedOrder.id}`);
    } catch (error) {
      // If Kafka publish fails synchronously, save to outbox for retry
      this.logger.error(
        `Failed to publish order event to Kafka, saving to outbox: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.outboxService.saveToOutbox(
        'order-events',
        eventPayload,
        error instanceof Error ? error.message : String(error),
      );
    }

    // Cache for Idempotency
    await this.redis.set(
      `order:${idempotencyKey}`,
      JSON.stringify(savedOrder),
      'EX',
      3600, // 1 hour expiration
    );

    return savedOrder;
  }

  async updateOrderStatus(data: any) {
    const { orderId, status } = data;
    await this.orderRepository.update(orderId, { status });
    console.log(`Order ${orderId} updated to ${status}`);
  }
}
