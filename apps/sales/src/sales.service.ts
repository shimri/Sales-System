import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './order/order.entity';
import { ClientKafka } from '@nestjs/microservices';
import Redis from 'ioredis';
import { CorrelationIdService } from './correlation-id/correlation-id.service';

@Injectable()
export class SalesService implements OnModuleInit {
  private readonly redis: Redis;

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @Inject('DELIVERY_SERVICE') private readonly deliveryClient: ClientKafka,
    private readonly correlationIdService: CorrelationIdService,
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
      status: 'Pending Shipment',
    });
    const savedOrder = await this.orderRepository.save(order);

    // Publish Event
    const correlationId = this.correlationIdService.getCorrelationId();
    this.deliveryClient.emit('order-events', {
      orderId: savedOrder.id,
      userId,
      items,
      amount,
      timestamp: new Date().toISOString(),
      correlationId: correlationId || 'unknown',
    });

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
