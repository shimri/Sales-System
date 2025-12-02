// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Module } from '@nestjs/common';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule } from '@nestjs/config';
import { Shipment } from './shipment/shipment.entity';
import { databaseConfig } from './database/database.config';
import { EventValidator } from './validator/event.validator';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot(databaseConfig()),
    TypeOrmModule.forFeature([Shipment]),
    ClientsModule.register([
      {
        name: 'SALES_SERVICE',
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
            groupId: 'delivery-producer',
            allowAutoTopicCreation: true,
          },
        },
      },
    ]),
  ],
  controllers: [DeliveryController],
  providers: [DeliveryService, EventValidator],
})
export class DeliveryModule { }
