import { NestFactory } from '@nestjs/core';
import { SalesModule } from './sales.module';

async function bootstrap() {
  const app = await NestFactory.create(SalesModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
