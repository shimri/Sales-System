import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shipment } from './shipment/shipment.entity';
import { ClientKafka } from '@nestjs/microservices';

@Injectable()
export class DeliveryService implements OnModuleInit {
  constructor(
    @InjectRepository(Shipment)
    private readonly shipmentRepository: Repository<Shipment>,
    @Inject('SALES_SERVICE') private readonly salesClient: ClientKafka,
  ) {}

  async onModuleInit() {
    await this.salesClient.connect();
  }

  async processOrder(orderData: any) {
    console.log('Processing order:', orderData);
    const { orderId, userId } = orderData;

    // Create Shipment
    const shipment = this.shipmentRepository.create({
      orderId,
      userId,
      status: 'Pending',
    });
    await this.shipmentRepository.save(shipment);

    // Simulate Processing Time
    setTimeout(async () => {
      // Update to Shipped
      shipment.status = 'Shipped';
      await this.shipmentRepository.save(shipment);
      this.salesClient.emit('delivery-events', {
        orderId,
        status: 'Shipped',
        timestamp: new Date().toISOString(),
      });
      console.log(`Order ${orderId} Shipped`);

      // Simulate Delivery Time
      setTimeout(async () => {
        // Update to Delivered
        shipment.status = 'Delivered';
        await this.shipmentRepository.save(shipment);
        this.salesClient.emit('delivery-events', {
          orderId,
          status: 'Delivered',
          timestamp: new Date().toISOString(),
        });
        console.log(`Order ${orderId} Delivered`);
      }, 5000);
    }, 2000);
  }
}
