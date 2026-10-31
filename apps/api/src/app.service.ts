import { Injectable } from '@nestjs/common';
import { DatabaseService } from './database/database.service.js';
import { CacheService } from './cache/cache.service.js';
import { StorageService } from './storage/storage.service.js';

@Injectable()
export class AppService {
  constructor(
    private readonly database: DatabaseService,
    private readonly cache: CacheService,
    private readonly storage: StorageService,
  ) {}

  getHello(): string {
    return 'NEXA API';
  }

  async getHealth() {
    await Promise.all([
      this.database.query('SELECT 1'),
      this.cache.client.ping(),
      this.storage.checkHealth(),
    ]);
    return { status: 'ok', service: 'nexa-api', timestamp: new Date().toISOString() };
  }
}
