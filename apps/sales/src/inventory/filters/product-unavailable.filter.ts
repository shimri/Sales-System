import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ProductUnavailableException } from '../exceptions/product-unavailable.exception';

@Catch(ProductUnavailableException)
export class ProductUnavailableExceptionFilter implements ExceptionFilter {
  catch(exception: ProductUnavailableException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const errorResponse = exception.getResponse();

    response.status(HttpStatus.BAD_REQUEST).json(errorResponse);
  }
}

