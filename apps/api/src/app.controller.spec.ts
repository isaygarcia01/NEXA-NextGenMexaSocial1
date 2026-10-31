import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;
  let healthCheck: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    healthCheck = vi.fn().mockResolvedValue({ status: 'ok', service: 'nexa-api' });
    const appService = {
      getHello: () => 'NEXA API',
      getHealth: healthCheck,
    };
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{
        provide: AppService,
        useValue: appService,
      }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should identify the NEXA API', () => {
      expect(appController.getHello()).toBe('NEXA API');
    });

    it('should return a healthy status payload', async () => {
      expect(await appController.getHealth()).toMatchObject({
        status: 'ok',
        service: 'nexa-api',
      });
    });

    it('returns a generic unavailable response and logs dependency failures', async () => {
      const logError = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      healthCheck.mockRejectedValue(new Error('database connection detail'));
      await expect(appController.getHealth()).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(logError).toHaveBeenCalledOnce();
    });

    it('reports liveness without dependency checks', () => {
      expect(appController.getLive()).toEqual({ status: 'ok', service: 'nexa-api' });
    });
  });
});
