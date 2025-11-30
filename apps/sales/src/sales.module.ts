import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule } from '@nestjs/config';
import { Order } from './order/order.entity';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'user',
      password: 'password',
      database: 'checkpoint_db',
      autoLoadEntities: true,
      synchronize: true, // For dev only
    }),
    TypeOrmModule.forFeature([Order]),
    ClientsModule.register([
      {
        name: 'DELIVERY_SERVICE',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'sales',
            brokers: ['localhost:9092'],
          },
          consumer: {
            groupId: 'sales-consumer',
          },
        },
      },
    ]),
  ],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule { }
