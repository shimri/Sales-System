import { Module } from '@nestjs/common';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule } from '@nestjs/config';
import { Shipment } from './shipment/shipment.entity';

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
    TypeOrmModule.forFeature([Shipment]),
    ClientsModule.register([
      {
        name: 'SALES_SERVICE',
        transport: Transport.KAFKA,
        options: {
          client: {
            clientId: 'delivery',
            brokers: ['localhost:9092'],
          },
          consumer: {
            groupId: 'delivery-producer',
          },
        },
      },
    ]),
  ],
  controllers: [DeliveryController],
  providers: [DeliveryService],
})
export class DeliveryModule { }
