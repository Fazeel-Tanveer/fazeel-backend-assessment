import { ApiProperty } from '@nestjs/swagger';
import { OTP_SENT } from '../auth.constants.js';

export class OtpRequestedDto {
  @ApiProperty({ example: OTP_SENT })
  message: string;
}
