import { ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service.js';

describe('CacheService', () => {
  const service = new CacheService(new ConfigService({ REDIS_URL: 'redis://localhost:6379' }));

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets the expiry only when a rate-limit window is created', async () => {
    const increment = vi.spyOn(service.client, 'incr')
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const expire = vi.spyOn(service.client, 'expire').mockResolvedValue(1);

    await expect(service.incrementWindow('rate:test', 60)).resolves.toBe(1);
    await expect(service.incrementWindow('rate:test', 60)).resolves.toBe(2);
    expect(increment).toHaveBeenCalledTimes(2);
    expect(expire).toHaveBeenCalledOnce();
    expect(expire).toHaveBeenCalledWith('rate:test', 60);
  });

  it('connects, verifies Redis, and closes cleanly', async () => {
    const connect = vi.spyOn(service.client, 'connect').mockResolvedValue(service.client);
    const ping = vi.spyOn(service.client, 'ping').mockResolvedValue('PONG');
    const quit = vi.spyOn(service.client, 'quit').mockResolvedValue('OK');

    await service.onModuleInit();
    await service.onModuleDestroy();
    expect(connect).toHaveBeenCalledOnce();
    expect(ping).toHaveBeenCalledOnce();
    expect(quit).toHaveBeenCalledOnce();
  });
});
