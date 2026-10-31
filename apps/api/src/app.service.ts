import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'NEXA API';
  }

  getHealth() {
    return {
      status: 'ok',
      service: 'nexa-api',
      timestamp: new Date().toISOString(),
    };
  }
}
