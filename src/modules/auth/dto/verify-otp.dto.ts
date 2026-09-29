import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { OTP_PATTERN } from '../auth.constants.js';
import { RequestOtpDto } from './request-otp.dto.js';

export class VerifyOtpDto extends RequestOtpDto {
  @ApiProperty({ example: '123456', description: 'The 6-digit code sent' })
  @Matches(OTP_PATTERN, { message: 'code must be a 6-digit number' })
  code: string;
}
