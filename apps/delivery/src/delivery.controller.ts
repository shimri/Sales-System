import { Controller } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { EventPattern, Payload } from '@nestjs/microservices';

@Controller()
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) { }

  @EventPattern('order-events')
  handleOrderCreated(@Payload() message: any) {
    return this.deliveryService.processOrder(message);
  }
}
