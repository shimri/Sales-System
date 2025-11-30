import { Controller } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { EventPattern, Payload } from '@nestjs/microservices';
import { OrderEventDto } from './order-event.dto';

@Controller()
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @EventPattern('order-events')
  handleOrderCreated(@Payload() message: OrderEventDto) {
    return this.deliveryService.processOrder(message);
  }
}
