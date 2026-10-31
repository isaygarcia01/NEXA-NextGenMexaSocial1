import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service.js';
import { CacheService } from './cache/cache.service.js';
import { DatabaseService } from './database/database.service.js';
import { StorageService } from './storage/storage.service.js';

describe('AppService', () => {
  let appService: AppService;
  const query = vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] });
  const ping = vi.fn().mockResolvedValue('PONG');
  const checkHealth = vi.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    query.mockClear();
    ping.mockClear();
    checkHealth.mockClear();
    const app: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        { provide: DatabaseService, useValue: { query } },
        { provide: CacheService, useValue: { client: { ping } } },
        { provide: StorageService, useValue: { checkHealth } },
      ],
    }).compile();

    appService = app.get<AppService>(AppService);
  });

  it('identifies the NEXA API', () => {
    expect(appService.getHello()).toBe('NEXA API');
  });

  it('checks each dependency and returns a timestamped health response', async () => {
    const health = await appService.getHealth();

    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(ping).toHaveBeenCalledOnce();
    expect(checkHealth).toHaveBeenCalledOnce();
    expect(health).toMatchObject({ status: 'ok', service: 'nexa-api' });
    expect(Number.isNaN(Date.parse(health.timestamp))).toBe(false);
  });
});
