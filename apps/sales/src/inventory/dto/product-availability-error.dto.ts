export class UnavailableProductDto {
  productId: string;
  requestedQuantity: number;
  availableQuantity: number;
}

export class ProductAvailabilityErrorResponseDto {
  statusCode: number;
  message: string;
  errorCode: string;
  unavailableProducts: UnavailableProductDto[];
}

