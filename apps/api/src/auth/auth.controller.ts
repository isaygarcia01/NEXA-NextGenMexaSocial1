import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import {
  EmailDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  TokenDto,
  UpdatePasswordDto,
} from './auth.dto.js';
import { CurrentUser, type AuthenticatedUser } from '../common/current-user.decorator.js';
import { ConfigService } from '@nestjs/config';

const REFRESH_COOKIE = 'nexa_refresh';

@ApiTags('authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Crea una cuenta y envía la verificación de correo' })
  register(@Body() body: RegisterDto) {
    return this.auth.register(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inicia sesión con email y contraseña' })
  async login(@Body() body: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(body, this.sessionMeta(request));
    this.setRefreshCookie(response, result.refreshToken);
    return {
      accessToken: result.accessToken,
      sessionId: result.sessionId,
      user: result.user,
      emailVerified: result.emailVerified,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rota el refresh token y emite un access token' })
  async refresh(
    @Body() body: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = body.refreshToken ?? request.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) {
      response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    const result = await this.auth.refresh(refreshToken, this.sessionMeta(request));
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, sessionId: result.sessionId, user: result.user };
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoca la sesión actual' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(user.sessionId, user.id);
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    return { loggedOut: true };
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verifica el correo con un token de un solo uso' })
  verifyEmail(@Body() body: TokenDto) {
    return this.auth.verifyEmail(body.token);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicita un enlace de restablecimiento' })
  forgotPassword(@Body() body: EmailDto) {
    return this.auth.requestPasswordReset(body.email);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reenvía el enlace de verificación sin revelar si existe la cuenta' })
  resendVerification(@Body() body: EmailDto) {
    return this.auth.resendVerification(body.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restablece la contraseña e invalida las sesiones existentes' })
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.auth.resetPassword(body.token, body.password);
  }

  @Post('change-password')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambia la contraseña y revoca todas las sesiones' })
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdatePasswordDto) {
    await this.auth.changePassword(user.id, body.currentPassword, body.newPassword);
  }

  @Get('sessions')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lista las sesiones activas del usuario' })
  listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.listSessions(user.id, user.sessionId);
  }

  @Delete('sessions/:sessionId')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoca una sesión remota del usuario' })
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
  ) {
    await this.auth.revokeSession(user.id, sessionId);
  }

  private sessionMeta(request: Request) {
    return {
      userAgent: request.get('user-agent')?.slice(0, 512),
      ipAddress: request.ip,
    };
  }

  private setRefreshCookie(response: Response, token: string): void {
    response.cookie(REFRESH_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS') * 24 * 60 * 60 * 1000,
    });
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/api/v1/auth',
    };
  }
}
