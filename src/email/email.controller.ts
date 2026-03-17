import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { EmailService } from './email.service';
import { SendEmailDto } from './dto/send-email.dto';

@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('send')
  @HttpCode(HttpStatus.OK)
  send(@Body() dto: SendEmailDto) {
    return this.emailService.sendEmail(dto);
  }
}
