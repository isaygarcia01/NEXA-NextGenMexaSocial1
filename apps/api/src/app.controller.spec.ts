import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should identify the NEXA API', () => {
      expect(appController.getHello()).toBe('NEXA API');
    });

    it('should return a healthy status payload', () => {
      expect(appController.getHealth()).toMatchObject({
        status: 'ok',
        service: 'nexa-api',
      });
    });
  });
});
