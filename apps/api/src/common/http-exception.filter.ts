import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    if (!(exception instanceof HttpException)) {
      this.logger.error({
        message: 'Unhandled request exception',
        method: request.method,
        path: request.path,
        error: exception instanceof Error ? exception.message : 'Unknown error',
      });
    }
    const exceptionResponse = exception instanceof HttpException
      ? exception.getResponse()
      : undefined;
    const message = typeof exceptionResponse === 'object' && exceptionResponse !== null
      ? (exceptionResponse as { message?: string | string[] }).message
      : typeof exceptionResponse === 'string'
        ? exceptionResponse
        : status >= 500
          ? 'Internal server error'
          : 'Request failed';
    response.status(status).json({
      statusCode: status,
      message: message ?? 'Request failed',
      path: request.path,
      timestamp: new Date().toISOString(),
    });
  }
}
