import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get()
  root() {
    return { service: 'sales', status: 'ok' };
  }

  @Get('health')
  health() {
    return { service: 'sales', status: 'ok' };
  }
}


