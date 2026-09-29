import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator.js';
import {
  OTP_REQUEST_THROTTLE,
  OTP_SENT,
  OTP_VERIFY_THROTTLE,
} from './auth.constants.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { OtpRequestedDto } from './dto/otp-requested.dto.js';
import { RequestOtpDto } from './dto/request-otp.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { OtpService } from './otp.service.js';

@ApiTags('auth')
@Public()
@Controller('auth/otp')
export class OtpController {
  constructor(private readonly otp: OtpService) {}

  @Throttle(OTP_REQUEST_THROTTLE)
  @Post('request')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Send a one-time login code by email or SMS' })
  @ApiAcceptedResponse({ type: OtpRequestedDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiTooManyRequestsResponse({
    description:
      'A code was sent in the last 60 seconds, or over 3 requests per minute',
  })
  async request(@Body() dto: RequestOtpDto): Promise<OtpRequestedDto> {
    await this.otp.requestCode(dto.identifier);
    return { message: OTP_SENT };
  }

  @Throttle(OTP_VERIFY_THROTTLE)
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with a one-time login code' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({
    description: 'Code is wrong, expired, already used or out of attempts',
  })
  @ApiTooManyRequestsResponse({ description: 'Over 5 attempts per minute' })
  verify(@Body() dto: VerifyOtpDto): Promise<AuthResponseDto> {
    return this.otp.verifyCode(dto);
  }
}
