import { IsEmail, IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class SendEmailDto {
  @IsEmail()
  to: string;

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  plainText: string;

  @IsString()
  @IsOptional()
  html?: string;
}
