import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DeliveryModule } from './delivery.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    DeliveryModule,
    {
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
          groupId: 'delivery-consumer',
          allowAutoTopicCreation: true,
        },
      },
    },
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen();
}
bootstrap();
