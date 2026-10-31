import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { argon2id, hash, verify } from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import { DatabaseService } from '../database/database.service.js';
import { CacheService } from '../cache/cache.service.js';
import { MailerService } from './mailer.service.js';
import type { LoginDto, RegisterDto } from './auth.dto.js';

type UserRecord = {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  email_verified_at: Date | null;
  status: string;
};

type SessionMeta = { userAgent?: string; ipAddress?: string };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: Uint8Array;
  private readonly accessTtl: number;
  private readonly refreshTtlDays: number;

  constructor(
    private readonly database: DatabaseService,
    private readonly cache: CacheService,
    private readonly mailer: MailerService,
    config: ConfigService,
  ) {
    this.jwtSecret = new TextEncoder().encode(config.getOrThrow<string>('JWT_ACCESS_SECRET'));
    this.accessTtl = config.getOrThrow<number>('ACCESS_TOKEN_TTL_SECONDS');
    this.refreshTtlDays = config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS');
  }

  async register(input: RegisterDto) {
    const email = input.email.trim().toLowerCase();
    const username = input.username.trim().toLowerCase();
    const passwordHash = await hash(input.password, { type: argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    const client = await this.database.pool.connect();
    let user: Pick<UserRecord, 'id' | 'email' | 'username'>;
    const verificationToken = randomBytes(32).toString('base64url');
    try {
      await client.query('BEGIN');
      const inserted = await client.query<Pick<UserRecord, 'id' | 'email' | 'username'>>(
        `INSERT INTO users (email, username, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, email, username`,
        [email, username, passwordHash],
      );
      user = inserted.rows[0]!;
      await client.query(
        'INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)',
        [user.id, input.displayName.trim()],
      );
      await client.query(
        `INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at)
         VALUES ($1, $2, 'verify_email', now() + interval '24 hours')`,
        [user.id, this.digest(verificationToken)],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id)
         VALUES ($1, 'account.registered', 'user', $2)`,
        [user.id, user.id],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if (this.isUniqueViolation(error)) throw new ConflictException('Email or username already registered');
      throw error;
    } finally {
      client.release();
    }
    await this.mailer.sendVerification(email, verificationToken);
    this.logger.log(`Account registered: ${user.id}`);
    return { user, emailVerified: false };
  }

  async login(input: LoginDto, meta: SessionMeta) {
    const result = await this.database.query<UserRecord>(
      `SELECT id, email, username, password_hash, email_verified_at, status
       FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [input.email.trim().toLowerCase()],
    );
    const user = result.rows[0];
    if (!user || user.status !== 'active' || !user.password_hash || !(await verify(user.password_hash, input.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.email_verified_at) {
      throw new UnauthorizedException('Verify your email before signing in');
    }
    return { ...await this.createSession(user, meta), emailVerified: Boolean(user.email_verified_at) };
  }

  async verifyEmail(token: string): Promise<{ verified: true }> {
    const digest = this.digest(token);
    await this.database.transaction(async (client) => {
      const result = await client.query<{ user_id: string }>(
        `UPDATE auth_tokens SET consumed_at = now()
         WHERE token_hash = $1 AND purpose = 'verify_email' AND consumed_at IS NULL AND expires_at > now()
         RETURNING user_id`,
        [digest],
      );
      const tokenRecord = result.rows[0];
      if (!tokenRecord) throw new UnauthorizedException('Invalid or expired verification token');
      await client.query(
        'UPDATE users SET email_verified_at = now(), updated_at = now() WHERE id = $1',
        [tokenRecord.user_id],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id)
         VALUES ($1, 'account.email_verified', 'user', $2)`,
        [tokenRecord.user_id, tokenRecord.user_id],
      );
    });
    return { verified: true };
  }

  async resendVerification(emailInput: string): Promise<{ message: string }> {
    const result = await this.database.query<{ id: string; email: string; email_verified_at: Date | null }>(
      `SELECT id, email, email_verified_at FROM users
       WHERE email = $1 AND deleted_at IS NULL AND status = 'active'`,
      [emailInput.trim().toLowerCase()],
    );
    const user = result.rows[0];
    if (user && !user.email_verified_at) {
      const token = randomBytes(32).toString('base64url');
      await this.database.query(
        `INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at)
         VALUES ($1, $2, 'verify_email', now() + interval '24 hours')`,
        [user.id, this.digest(token)],
      );
      await this.mailer.sendVerification(user.email, token);
    }
    return { message: 'If that account needs verification, a link has been sent.' };
  }

  async requestPasswordReset(emailInput: string): Promise<{ message: string }> {
    const email = emailInput.trim().toLowerCase();
    const result = await this.database.query<{ id: string; email: string }>(
      'SELECT id, email FROM users WHERE email = $1 AND deleted_at IS NULL AND status = $2',
      [email, 'active'],
    );
    const user = result.rows[0];
    if (user) {
      const token = randomBytes(32).toString('base64url');
      await this.database.query(
        `INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at)
         VALUES ($1, $2, 'reset_password', now() + interval '1 hour')`,
        [user.id, this.digest(token)],
      );
      await this.mailer.sendPasswordReset(user.email, token);
      await this.audit(user.id, 'account.password_reset_requested', 'user', user.id);
    }
    return { message: 'If that account exists, a reset link has been sent.' };
  }

  async resetPassword(token: string, password: string): Promise<{ reset: true }> {
    const passwordHash = await hash(password, { type: argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    const client = await this.database.pool.connect();
    let userId: string;
    let sessionIds: string[];
    try {
      await client.query('BEGIN');
      const result = await client.query<{ user_id: string }>(
        `UPDATE auth_tokens SET consumed_at = now()
         WHERE token_hash = $1 AND purpose = 'reset_password'
           AND consumed_at IS NULL AND expires_at > now()
         RETURNING user_id`,
        [this.digest(token)],
      );
      const tokenRecord = result.rows[0];
      if (!tokenRecord) throw new UnauthorizedException('Invalid or expired reset token');
      userId = tokenRecord.user_id;
      await client.query(
        'UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2',
        [passwordHash, userId],
      );
      await client.query(
        `UPDATE auth_tokens SET consumed_at = now()
         WHERE user_id = $1 AND purpose = 'reset_password' AND consumed_at IS NULL`,
        [userId],
      );
      const sessions = await client.query<{ id: string }>(
        'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL RETURNING id',
        [userId],
      );
      sessionIds = sessions.rows.map((session) => session.id);
      await client.query(
        `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id)
         VALUES ($1, 'account.password_reset', 'user', $2)`,
        [userId, userId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    if (sessionIds.length) {
      await this.cache.client.del(...sessionIds.map((id) => `auth:session:${id}`));
    }
    return { reset: true };
  }

  async refresh(refreshToken: string, meta: SessionMeta) {
    const oldHash = this.digest(refreshToken);
    const nextRefreshToken = randomBytes(48).toString('base64url');
    const nextHash = this.digest(nextRefreshToken);
    const result = await this.database.query<{ id: string; user_id: string; email: string; username: string }>(
      `UPDATE sessions s
       SET refresh_token_hash = $1, expires_at = now() + ($2 * interval '1 day'),
           user_agent = $3, ip_address = $4
       FROM users u
       WHERE s.refresh_token_hash = $5 AND s.revoked_at IS NULL
         AND s.expires_at > now() AND u.id = s.user_id AND u.status = 'active'
         AND u.deleted_at IS NULL
       RETURNING s.id, s.user_id, u.email, u.username`,
      [nextHash, this.refreshTtlDays, meta.userAgent ?? null, meta.ipAddress ?? null, oldHash],
    );
    const session = result.rows[0];
    if (!session) throw new UnauthorizedException('Invalid or expired refresh token');
    const accessToken = await this.createAccessToken(session.user_id, session.email, session.id);
    await this.audit(session.user_id, 'session.refreshed', 'session', session.id);
    return {
      accessToken,
      refreshToken: nextRefreshToken,
      sessionId: session.id,
      user: { id: session.user_id, email: session.email, username: session.username },
    };
  }

  async logout(sessionId: string, userId: string): Promise<void> {
    await this.database.query(
      'UPDATE sessions SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL',
      [sessionId, userId],
    );
    await this.cache.client.del(`auth:session:${sessionId}`);
    await this.audit(userId, 'session.revoked', 'session', sessionId);
  }

  async listSessions(userId: string, currentSessionId: string) {
    const result = await this.database.query(
      `SELECT s.id, s.id = $2 AS "isCurrent", s.device_id AS "deviceId", s.user_agent AS "userAgent",
              s.ip_address AS "ipAddress", s.created_at AS "createdAt",
              d.last_seen_at AS "lastSeenAt", s.expires_at AS "expiresAt"
       FROM sessions s LEFT JOIN devices d ON d.id = s.device_id
       WHERE s.user_id = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
       ORDER BY s.created_at DESC`,
      [userId, currentSessionId],
    );
    return result.rows;
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const result = await this.database.query(
      `UPDATE sessions SET revoked_at = now()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [sessionId, userId],
    );
    if (!result.rowCount) throw new UnauthorizedException('Session not found');
    await this.cache.client.del(`auth:session:${sessionId}`);
    await this.audit(userId, 'session.revoked', 'session', sessionId);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const result = await this.database.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId],
    );
    const account = result.rows[0];
    if (!account || !(await verify(account.password_hash, currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const passwordHash = await hash(newPassword, { type: argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    const sessionIds = await this.database.transaction(async (client) => {
      await client.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, userId]);
      const sessions = await client.query<{ id: string }>(
        'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL RETURNING id',
        [userId],
      );
      return sessions.rows.map((session) => session.id);
    });
    if (sessionIds.length) {
      await this.cache.client.del(...sessionIds.map((id) => `auth:session:${id}`));
    }
    await this.audit(userId, 'account.password_changed', 'user', userId);
  }

  private async createSession(user: UserRecord, meta: SessionMeta) {
    const refreshToken = randomBytes(48).toString('base64url');
    const tokenHash = this.digest(refreshToken);
    const sessionId = await this.database.transaction(async (client) => {
      const deviceResult = await client.query<{ id: string }>(
        `INSERT INTO devices (user_id, device_name, last_seen_at)
         VALUES ($1, $2, now()) RETURNING id`,
        [user.id, meta.userAgent?.slice(0, 120) ?? 'Unknown device'],
      );
      const sessionResult = await client.query<{ id: string }>(
        `INSERT INTO sessions (user_id, device_id, refresh_token_hash, expires_at, user_agent, ip_address)
         VALUES ($1, $2, $3, now() + ($4 * interval '1 day'), $5, $6)
         RETURNING id`,
        [user.id, deviceResult.rows[0]!.id, tokenHash, this.refreshTtlDays, meta.userAgent ?? null, meta.ipAddress ?? null],
      );
      return sessionResult.rows[0]!.id;
    });
    const accessToken = await this.createAccessToken(user.id, user.email, sessionId);
    await this.audit(user.id, 'session.created', 'session', sessionId);
    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, username: user.username },
      sessionId,
    };
  }

  private createAccessToken(userId: string, email: string, sessionId: string): Promise<string> {
    return new SignJWT({ email, sid: sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${this.accessTtl}s`)
      .sign(this.jwtSecret);
  }

  private digest(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async audit(actorId: string, action: string, type: string, resourceId: string): Promise<void> {
    await this.database.query(
      `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id)
       VALUES ($1, $2, $3, $4)`,
      [actorId, action, type, resourceId],
    );
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error
      && (error as { code: string }).code === '23505';
  }
}
