import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { OrderCreationInProgressException } from '../exceptions/order-creation-in-progress.exception';

@Catch(OrderCreationInProgressException)
export class OrderCreationInProgressExceptionFilter implements ExceptionFilter {
  catch(exception: OrderCreationInProgressException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const errorResponse = exception.getResponse();

    response.status(HttpStatus.CONFLICT).json(errorResponse);
  }
}

