import { Body, Controller, Logger, Post, UseGuards, BadRequestException } from '@nestjs/common';
import { SalesService } from './sales.service';
import { Ctx, EventPattern, KafkaContext, Payload } from '@nestjs/microservices';
import { CreateOrderDto } from './order/dto/create-order.dto';
import { DeliveryEventDto } from './order/dto/delivery-event.dto';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { User } from './auth/decorators/user.decorator';

@Controller('orders')
export class SalesController {
  private readonly logger = new Logger(SalesController.name);

  constructor(private readonly salesService: SalesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  createOrder(@Body() body: CreateOrderDto, @User() user: any) {
    this.logger.log(`Creating order for authenticated user: ${user.sub}`);
    return this.salesService.createOrder(body);
  }

  @EventPattern('delivery-events')
  async handleDeliveryStatus(
    @Payload() message: DeliveryEventDto,
    @Ctx() context: KafkaContext,
  ) {
    try {
      this.logger.log(`Received delivery update for order ${message.orderId}`);
      const result = await this.salesService.updateOrderStatus(message);

      // Commit offset after successful processing
      const consumer = context.getConsumer();
      const { offset } = context.getMessage();
      const partition = context.getPartition();
      const topic = context.getTopic();
      await consumer.commitOffsets([
        { topic, partition, offset: String(offset) },
      ]);

      this.logger.log(
        `Successfully processed and committed offset for delivery event (order ${message.orderId})`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to process delivery event: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      // Re-throw to let Kafka handle retries - offset NOT committed, allowing redelivery
      throw error;
    }
  }
}
