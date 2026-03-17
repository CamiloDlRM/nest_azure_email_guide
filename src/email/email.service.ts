import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailClient, EmailMessage } from '@azure/communication-email';
import { SendEmailDto } from './dto/send-email.dto';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly client: EmailClient;
  private readonly senderAddress: string;

  constructor(private readonly config: ConfigService) {
    const connectionString = this.config.getOrThrow<string>('ACS_CONNECTION_STRING');
    this.senderAddress = this.config.getOrThrow<string>('ACS_SENDER_ADDRESS');
    this.client = new EmailClient(connectionString);
  }

  async sendEmail(dto: SendEmailDto): Promise<{ messageId: string }> {
    const message: EmailMessage = {
      senderAddress: this.senderAddress,
      recipients: {
        to: [{ address: dto.to }],
      },
      content: {
        subject: dto.subject,
        plainText: dto.plainText,
        ...(dto.html && { html: dto.html }),
      },
    };

    try {
      const poller = await this.client.beginSend(message);
      const result = await poller.pollUntilDone();

      this.logger.log(`Email sent successfully. MessageId: ${result.id}`);
      return { messageId: result.id };
    } catch (error) {
      this.logger.error('Failed to send email', error);
      throw new InternalServerErrorException('Failed to send email via Azure Communication Services');
    }
  }
}
