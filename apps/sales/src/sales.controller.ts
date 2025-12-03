import { Body, Controller, Logger, Post } from '@nestjs/common';
import { SalesService } from './sales.service';
import { Ctx, EventPattern, KafkaContext, Payload } from '@nestjs/microservices';
import { CreateOrderDto } from './order/dto/create-order.dto';
import { DeliveryEventDto } from './order/dto/delivery-event.dto';

@Controller('orders')
export class SalesController {
  private readonly logger = new Logger(SalesController.name);

  constructor(private readonly salesService: SalesService) {}

  @Post()
  createOrder(@Body() body: CreateOrderDto) {
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
