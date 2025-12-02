import { Body, Controller, Post } from '@nestjs/common';
import { SalesService } from './sales.service';
import { EventPattern, Payload } from '@nestjs/microservices';
import { CreateOrderDto } from './order/dto/create-order.dto';
import { DeliveryEventDto } from './order/dto/delivery-event.dto';

@Controller('orders')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  createOrder(@Body() body: CreateOrderDto) {
    return this.salesService.createOrder(body);
  }

  @EventPattern('delivery-events')
  handleDeliveryStatus(@Payload() message: DeliveryEventDto) {
    console.log('Received delivery update:', message);
    return this.salesService.updateOrderStatus(message);
  }
}
