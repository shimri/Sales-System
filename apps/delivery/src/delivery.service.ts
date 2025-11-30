import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shipment, ShipmentStatus } from './shipment/shipment.entity';
import { ClientKafka } from '@nestjs/microservices';
import { EventValidator } from './validator/event.validator';

@Injectable()
export class DeliveryService implements OnModuleInit {
  constructor(
    @InjectRepository(Shipment)
    private readonly shipmentRepository: Repository<Shipment>,
    @Inject('SALES_SERVICE') private readonly salesClient: ClientKafka,
    private readonly eventValidator: EventValidator,
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
      status: ShipmentStatus.Pending,
    });
    await this.shipmentRepository.save(shipment);

    // Simulate Processing Time
    setTimeout(async () => {
      // Update to Shipped
      shipment.status = ShipmentStatus.Shipped;
      await this.shipmentRepository.save(shipment);
      
      const shippedEventPayload = {
        orderId,
        status: ShipmentStatus.Shipped,
        timestamp: new Date().toISOString(),
      };

      // Validate event payload before publishing
      await this.eventValidator.validateDeliveryEvent(shippedEventPayload);

      this.salesClient.emit('delivery-events', shippedEventPayload);
      console.log(`Order ${orderId} Shipped`);

      // Simulate Delivery Time
      setTimeout(async () => {
        // Update to Delivered
        shipment.status = ShipmentStatus.Delivered;
        await this.shipmentRepository.save(shipment);
        
        const deliveredEventPayload = {
          orderId,
          status: ShipmentStatus.Delivered,
          timestamp: new Date().toISOString(),
        };

        // Validate event payload before publishing
        await this.eventValidator.validateDeliveryEvent(deliveredEventPayload);

        this.salesClient.emit('delivery-events', deliveredEventPayload);
        console.log(`Order ${orderId} Delivered`);
      }, 5000);
    }, 2000);
  }
}
