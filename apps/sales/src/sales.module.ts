import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { Order } from './order/order.entity';
import { databaseConfig } from './database/database.config';
import { CorrelationIdMiddleware } from './middleware/correlation-id.middleware';
import { CorrelationIdService } from './correlation-id/correlation-id.service';
import { EventValidator } from './validator/event.validator';
import { Outbox } from './outbox/outbox.entity';
import { OutboxService } from './outbox/outbox.service';
import { OutboxSchedulerService } from './outbox/outbox-scheduler.service';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot(databaseConfig()),
    TypeOrmModule.forFeature([Order, Outbox]),
    ClientsModule.register([
      {
        name: 'DELIVERY_SERVICE',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'sales',
            brokers: [process.env.KAFKA_BROKERS || 'localhost:9092'],
          },
          consumer: {
            groupId: 'sales-consumer',
          },
        },
      },
    ]),
  ],
  controllers: [SalesController],
  providers: [
    SalesService,
    CorrelationIdService,
    EventValidator,
    OutboxService,
    OutboxSchedulerService,
  ],
})
export class SalesModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
