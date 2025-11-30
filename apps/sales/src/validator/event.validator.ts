import { Injectable, BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { OrderEventDto } from '../order/order-event.dto';

@Injectable()
export class EventValidator {
  async validateOrderEvent(payload: any): Promise<OrderEventDto> {
    const eventDto = plainToInstance(OrderEventDto, payload);
    const validationErrors = await validate(eventDto);

    if (validationErrors.length > 0) {
      const errorMessages = validationErrors
        .map((error) => Object.values(error.constraints || {}).join(', '))
        .join('; ');
      throw new BadRequestException(
        `Event validation failed: ${errorMessages}`,
      );
    }

    return eventDto;
  }
}

