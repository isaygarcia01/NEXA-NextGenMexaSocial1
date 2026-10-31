import { CanActivate, ExecutionContext, HttpException, Injectable, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CacheService } from '../cache/cache.service.js';
import type { Request } from 'express';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { OptionalAuthGuard } from './optional-auth.guard.js';
import { AuthService } from './auth.service.js';
import { MailerService } from './mailer.service.js';

@Injectable()
class RedisRateLimitGuard implements CanActivate {
  constructor(private readonly cache: CacheService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const bucket = Math.floor(Date.now() / 60_000);
    const route = request.route?.path ?? request.path;
    const isCredentialRoute = /^\/auth\/(login|register|forgot-password|reset-password|verify-email)$/.test(route);
    const limit = isCredentialRoute ? 10 : 120;
    const count = await this.cache.incrementWindow(`rate:${request.ip}:${route}:${bucket}`, 60);
    if (count > limit) throw new HttpException('Rate limit exceeded', 429);
    return true;
  }
}

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    OptionalAuthGuard,
    MailerService,
    RedisRateLimitGuard,
    { provide: APP_GUARD, useClass: RedisRateLimitGuard },
  ],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
