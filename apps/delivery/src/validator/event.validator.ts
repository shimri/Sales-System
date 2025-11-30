import { Injectable, BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { DeliveryEventDto } from '../delivery-event.dto';

@Injectable()
export class EventValidator {
  async validateDeliveryEvent(payload: any): Promise<DeliveryEventDto> {
    const eventDto = plainToInstance(DeliveryEventDto, payload);
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

