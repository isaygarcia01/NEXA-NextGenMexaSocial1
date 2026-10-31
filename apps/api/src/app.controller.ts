import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';

@ApiTags('platform')
@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @ApiOperation({ summary: 'Comprueba que la API está disponible' })
  async getHealth() {
    try {
      return await this.appService.getHealth();
    } catch (error) {
      this.logger.error({
        message: 'Health check failed',
        error: error instanceof Error ? error.message : 'Unknown dependency failure',
      });
      throw new ServiceUnavailableException('A required dependency is unavailable');
    }
  }

  @Get('health/live')
  @ApiOperation({ summary: 'Comprobación de liveness del proceso' })
  getLive() {
    return { status: 'ok', service: 'nexa-api' };
  }
}
