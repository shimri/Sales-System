import { NestFactory } from '@nestjs/core';
import { DeliveryModule } from './delivery.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    DeliveryModule,
    {
      transport: Transport.KAFKA,
      options: {
        client: {
          brokers: ['localhost:9092'],
        },
        consumer: {
          groupId: 'delivery-consumer',
        },
      },
    },
  );
  await app.listen();
}
bootstrap();
