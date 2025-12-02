import { Controller, Logger } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { EventPattern, Payload } from '@nestjs/microservices';
import { OrderEventDto } from './order-event.dto';

@Controller()
export class DeliveryController {
  private readonly logger = new Logger(DeliveryController.name);

  constructor(private readonly deliveryService: DeliveryService) {}

  @EventPattern('order-events')
  async handleOrderCreated(@Payload() message: OrderEventDto) {
    try {
      return await this.deliveryService.processOrder(message);
    } catch (error) {
      this.logger.error(
        `Failed to process order event: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      // Re-throw to let Kafka handle retries
      throw error;
    }
  }
}
