import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Shipment, ShipmentStatus } from './shipment/shipment.entity';
import { ClientKafka } from '@nestjs/microservices';
import { EventValidator } from './validator/event.validator';

@Injectable()
export class DeliveryService implements OnModuleInit {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    @InjectRepository(Shipment)
    private readonly shipmentRepository: Repository<Shipment>,
    @Inject('SALES_SERVICE') private readonly salesClient: ClientKafka,
    private readonly eventValidator: EventValidator,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.connectWithRetry();
  }

  private async connectWithRetry(maxRetries = 10, delay = 2000): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.salesClient.connect();
        this.logger.log('Successfully connected to Kafka');
        return;
      } catch (error) {
        if (attempt === maxRetries) {
          this.logger.error(
            `Failed to connect to Kafka after ${maxRetries} attempts: ${
              error instanceof Error ? error.message : String(error)
            }`,
            error instanceof Error ? error.stack : undefined,
          );
          throw error;
        }
        this.logger.warn(
          `Kafka connection attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 1.5, 10000); // Exponential backoff, max 10s
      }
    }
  }

  async processOrder(orderData: any) {
    const { orderId, userId, correlationId } = orderData;
    this.logger.log(`Processing order ${orderId} with correlationId ${correlationId}`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create Shipment
      const shipment = queryRunner.manager.create(Shipment, {
        orderId,
        userId,
        status: ShipmentStatus.Pending,
      });
      await queryRunner.manager.save(Shipment, shipment);
      await queryRunner.commitTransaction();
      this.logger.log(`Successfully created shipment for order ${orderId}`);

      // Simulate Processing Time
      setTimeout(() => {
        this.updateShipmentToShipped(orderId, correlationId).catch((error) => {
          this.logger.error(
            `Failed to update shipment to Shipped for order ${orderId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            error instanceof Error ? error.stack : undefined,
          );
        });
      }, 2000);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to create shipment for order ${orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async updateShipmentToShipped(
    orderId: string,
    correlationId: string,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Find shipment by orderId
      const shipment = await queryRunner.manager.findOne(Shipment, {
        where: { orderId },
      });

      if (!shipment) {
        throw new Error(`Shipment not found for order ${orderId}`);
      }

      // Update to Shipped
      shipment.status = ShipmentStatus.Shipped;
      await queryRunner.manager.save(Shipment, shipment);
      await queryRunner.commitTransaction();
      this.logger.log(`Successfully updated shipment to Shipped for order ${orderId}`);

      const shippedEventPayload = {
        orderId,
        status: ShipmentStatus.Shipped,
        timestamp: new Date().toISOString(),
        correlationId,
      };

      // Validate event payload before publishing
      try {
        await this.eventValidator.validateDeliveryEvent(shippedEventPayload);
      } catch (validationError) {
        this.logger.error(
          `Event validation failed for shipped event (order ${orderId}): ${
            validationError instanceof Error
              ? validationError.message
              : String(validationError)
          }`,
        );
        throw validationError;
      }

      // Emit event to Kafka (non-blocking)
      try {
        this.salesClient.emit('delivery-events', shippedEventPayload);
        this.logger.log(`Order ${orderId} Shipped`);
      } catch (kafkaError) {
        // Log error but don't block state update
        this.logger.error(
          `Failed to publish shipped event for order ${orderId}: ${
            kafkaError instanceof Error ? kafkaError.message : String(kafkaError)
          }`,
          kafkaError instanceof Error ? kafkaError.stack : undefined,
        );
      }

      // Simulate Delivery Time
      setTimeout(() => {
        this.updateShipmentToDelivered(orderId, correlationId).catch((error) => {
          this.logger.error(
            `Failed to update shipment to Delivered for order ${orderId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            error instanceof Error ? error.stack : undefined,
          );
        });
      }, 5000);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to update shipment to Shipped for order ${orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async updateShipmentToDelivered(
    orderId: string,
    correlationId: string,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Find shipment by orderId
      const shipment = await queryRunner.manager.findOne(Shipment, {
        where: { orderId },
      });

      if (!shipment) {
        throw new Error(`Shipment not found for order ${orderId}`);
      }

      // Update to Delivered
      shipment.status = ShipmentStatus.Delivered;
      await queryRunner.manager.save(Shipment, shipment);
      await queryRunner.commitTransaction();
      this.logger.log(
        `Successfully updated shipment to Delivered for order ${orderId}`,
      );

      const deliveredEventPayload = {
        orderId,
        status: ShipmentStatus.Delivered,
        timestamp: new Date().toISOString(),
        correlationId,
      };

      // Validate event payload before publishing
      try {
        await this.eventValidator.validateDeliveryEvent(deliveredEventPayload);
      } catch (validationError) {
        this.logger.error(
          `Event validation failed for delivered event (order ${orderId}): ${
            validationError instanceof Error
              ? validationError.message
              : String(validationError)
          }`,
        );
        throw validationError;
      }

      // Emit event to Kafka (non-blocking)
      try {
        this.salesClient.emit('delivery-events', deliveredEventPayload);
        this.logger.log(`Order ${orderId} Delivered`);
      } catch (kafkaError) {
        // Log error but don't block state update
        this.logger.error(
          `Failed to publish delivered event for order ${orderId}: ${
            kafkaError instanceof Error ? kafkaError.message : String(kafkaError)
          }`,
          kafkaError instanceof Error ? kafkaError.stack : undefined,
        );
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to update shipment to Delivered for order ${orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
