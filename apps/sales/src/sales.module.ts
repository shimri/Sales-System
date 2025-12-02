import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { Order } from './order/entity/order.entity';
import { databaseConfig } from './database/database.config';
import { CorrelationIdMiddleware } from './middleware/correlation-id.middleware';
import { CorrelationIdService } from './correlation-id/correlation-id.service';
import { EventValidator } from './validator/event.validator';
import Redis from 'ioredis';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot(databaseConfig()),
    TypeOrmModule.forFeature([Order]),
    ClientsModule.register([
      {
        name: 'DELIVERY_SERVICE',
        transport: Transport.KAFKA,
        options: {
          client: {
            brokers: process.env.KAFKA_BROKERS 
              ? process.env.KAFKA_BROKERS.split(',')
              : ['localhost:9092'],
            retry: {
              retries: 8,
              initialRetryTime: 100,
              multiplier: 2,
              maxRetryTime: 30000,
            },
            requestTimeout: 30000,
            connectionTimeout: 3000,
          },
          consumer: {
            groupId: 'sales-consumer',
            allowAutoTopicCreation: true,
          },
        },
      },
    ]),
  ],
  controllers: [SalesController],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: () => {
        return new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        });
      },
    },
    SalesService,
    CorrelationIdService,
    EventValidator,
  ],
})
export class SalesModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
