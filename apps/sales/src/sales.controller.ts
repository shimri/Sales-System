import { Controller, Get } from '@nestjs/common';
import { SalesService } from './sales.service';

@Controller()
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  getHello(): string {
    return this.salesService.getHello();
  }
}
