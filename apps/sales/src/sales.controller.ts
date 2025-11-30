import { Body, Controller, Post } from '@nestjs/common';
import { SalesService } from './sales.service';
import { EventPattern, Payload } from '@nestjs/microservices';

@Controller('orders')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  createOrder(@Body() body: any) {
    return this.salesService.createOrder(body);
  }

  @EventPattern('delivery-events')
  handleDeliveryStatus(@Payload() message: any) {
    console.log('Received delivery update:', message);
    return this.salesService.updateOrderStatus(message);
  }
}
