import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { CorrelationIdService } from '../correlation-id/correlation-id.service';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  constructor(private readonly correlationIdService: CorrelationIdService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const correlationId =
      (req.headers['x-correlation-id'] as string) || randomUUID();

    // Store correlation ID for this request using async context
    this.correlationIdService.runWithCorrelationId(correlationId, () => {
      // Add correlation ID to response headers
      res.setHeader('X-Correlation-Id', correlationId);
      next();
    });
  }
}

