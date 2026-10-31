import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from './auth.guard.js';

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly authGuard: AuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string } }>();
    if (!request.headers.authorization) return true;
    return this.authGuard.canActivate(context);
  }
}
