import { BadRequestException } from '@nestjs/common';
import { UnavailableProductDto } from '../dto/product-availability-error.dto';

export class ProductUnavailableException extends BadRequestException {
  private readonly unavailableProducts: UnavailableProductDto[];

  constructor(unavailableProducts: UnavailableProductDto[]) {
    const message = 'One or more products are unavailable';
    super(message);
    this.unavailableProducts = unavailableProducts;
  }

  getUnavailableProducts(): UnavailableProductDto[] {
    return this.unavailableProducts;
  }

  getResponse(): {
    statusCode: number;
    message: string;
    errorCode: string;
    unavailableProducts: UnavailableProductDto[];
  } {
    return {
      statusCode: this.getStatus(),
      message: this.message,
      errorCode: 'PRODUCT_UNAVAILABLE',
      unavailableProducts: this.unavailableProducts,
    };
  }
}

