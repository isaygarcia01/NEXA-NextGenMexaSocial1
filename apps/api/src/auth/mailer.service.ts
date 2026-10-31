import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter?: Transporter;
  private readonly sender: string;
  private readonly frontendUrl: string;
  private readonly production: boolean;

  constructor(config: ConfigService) {
    this.sender = config.get<string>('SMTP_FROM') ?? 'NEXA <no-reply@nexa.local>';
    this.frontendUrl = config.getOrThrow<string>('FRONTEND_URL');
    this.production = config.get<string>('NODE_ENV') === 'production';
    const host = config.get<string>('SMTP_HOST');
    const user = config.get<string>('SMTP_USER');
    const password = config.get<string>('SMTP_PASSWORD');
    const port = config.get<number>('SMTP_PORT');
    if (host && user && password && port) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass: password },
      });
    } else if (this.production) {
      throw new Error('SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASSWORD are required in production.');
    }
  }

  async sendVerification(to: string, token: string): Promise<void> {
    const url = `${this.frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;
    await this.send(to, 'Confirma tu correo de NEXA', `Confirma tu correo: ${url}`);
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const url = `${this.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await this.send(to, 'Restablece tu contraseña de NEXA', `Restablece tu contraseña: ${url}`);
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    if (this.transporter) {
      await this.transporter.sendMail({ from: this.sender, to, subject, text });
      return;
    }
    this.logger.log(`Development email queued for ${to}: ${text}`);
  }
}
