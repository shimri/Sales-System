import { Controller, Logger } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { Ctx, EventPattern, KafkaContext, Payload } from '@nestjs/microservices';
import { OrderEventDto } from './order-event.dto';

@Controller()
export class DeliveryController {
  private readonly logger = new Logger(DeliveryController.name);

  constructor(private readonly deliveryService: DeliveryService) {}

  @EventPattern('order-events')
  async handleOrderCreated(
    @Payload() message: OrderEventDto,
    @Ctx() context: KafkaContext,
  ) {
    try {
      const result = await this.deliveryService.processOrder(message);

      // Commit offset after successful processing
      const consumer = context.getConsumer();
      const { offset } = context.getMessage();
      const partition = context.getPartition();
      const topic = context.getTopic();
      await consumer.commitOffsets([
        { topic, partition, offset: String(offset) },
      ]);

      this.logger.log(
        `Successfully processed and committed offset for order ${message.orderId}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to process order event: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      // Re-throw to let Kafka handle retries - offset NOT committed, allowing redelivery
      throw error;
    }
  }
}
