import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify } from 'jose';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../common/current-user.decorator.js';
import { DatabaseService } from '../database/database.service.js';
import { CacheService } from '../cache/cache.service.js';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly secret: Uint8Array;

  constructor(
    config: ConfigService,
    private readonly database: DatabaseService,
    private readonly cache: CacheService,
  ) {
    this.secret = new TextEncoder().encode(config.getOrThrow<string>('JWT_ACCESS_SECRET'));
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('Authentication required');
    let payload: Awaited<ReturnType<typeof jwtVerify>>['payload'];
    try {
      ({ payload } = await jwtVerify(token, this.secret));
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    if (
      typeof payload.sub !== 'string'
      || typeof payload.email !== 'string'
      || typeof payload.sid !== 'string'
    ) {
      throw new UnauthorizedException('Invalid access token');
    }
    const cachedSession = await this.cache.client.get(`auth:session:${payload.sid}`);
    if (cachedSession !== 'active') {
      const session = await this.database.query(
        `SELECT 1 FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = $1 AND s.user_id = $2 AND s.revoked_at IS NULL
           AND s.expires_at > now() AND u.status = 'active' AND u.deleted_at IS NULL`,
        [payload.sid, payload.sub],
      );
      if (!session.rowCount) throw new UnauthorizedException('Session revoked');
      await this.database.query(
        `UPDATE devices SET last_seen_at = now()
         WHERE id = (SELECT device_id FROM sessions WHERE id = $1)`,
        [payload.sid],
      );
      await this.cache.client.set(`auth:session:${payload.sid}`, 'active', 'EX', 15);
    }
    request.user = { id: payload.sub, email: payload.email, sessionId: payload.sid };
    return true;
  }
}
