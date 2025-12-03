import { ConflictException } from '@nestjs/common';

export class OrderCreationInProgressException extends ConflictException {
  private readonly idempotencyKey: string;

  constructor(idempotencyKey: string) {
    const message = `Order creation is already in progress for the provided idempotency key. Please wait for the current request to complete or retry after a few moments.`;
    super(message);
    this.idempotencyKey = idempotencyKey;
  }

  getIdempotencyKey(): string {
    return this.idempotencyKey;
  }

  getResponse(): {
    statusCode: number;
    message: string;
    errorCode: string;
    idempotencyKey: string;
  } {
    return {
      statusCode: this.getStatus(),
      message: this.message,
      errorCode: 'ORDER_CREATION_IN_PROGRESS',
      idempotencyKey: this.idempotencyKey,
    };
  }
}

