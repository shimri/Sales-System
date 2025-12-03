import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { SalesModule } from './sales.module';

async function bootstrap() {
  const app = await NestFactory.create(SalesModule);
  
  // Connect as microservice to consume Kafka messages
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        brokers: process.env.KAFKA_BROKERS 
          ? process.env.KAFKA_BROKERS.split(',')
          : ['localhost:9092'],
        clientId: 'sales-consumer-server',
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
        groupId: 'sales-consumer',
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
  
  // Start both HTTP server and microservice
  await app.startAllMicroservices();
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
