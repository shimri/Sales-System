import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DeliveryModule } from './delivery.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(DeliveryModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        brokers: process.env.KAFKA_BROKERS
          ? process.env.KAFKA_BROKERS.split(',')
          : ['localhost:9092'],
        clientId: 'delivery-consumer-server',
        retry: {
          retries: 8,
          initialRetryTime: 100,
          multiplier: 2,
          maxRetryTime: 30000,
        },
        requestTimeout: 30000,
        connectionTimeout: 10000,
      },
      consumer: {
        groupId: 'delivery-consumer',
        allowAutoTopicCreation: true,
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
        maxInFlightRequests: 1,
      },
      run: {
        autoCommit: false,
      },
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.startAllMicroservices();
  await app.listen(process.env.port ?? 3001);
}
bootstrap();
