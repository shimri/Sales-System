import { NestFactory } from '@nestjs/core';
import { DeliveryModule } from './delivery.module';

async function bootstrap() {
  const app = await NestFactory.create(DeliveryModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
