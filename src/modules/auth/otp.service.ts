import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { isEmail } from '../../common/utils/identifier.js';
import { EventPublisher } from '../../infra/messaging/event-publisher.service.js';
import { UsersService } from '../users/users.service.js';
import {
  INVALID_OTP,
  OTP_COOLDOWN,
  OTP_TTL_SECONDS,
} from './auth.constants.js';
import type { AuthResponseDto } from './dto/auth-response.dto.js';
import type { VerifyOtpDto } from './dto/verify-otp.dto.js';
import { OtpStore } from './otp.store.js';
import { TokenService } from './token.service.js';

const SECONDS_PER_MINUTE = 60;

function loginCodeMessage(code: string): string {
  const minutes = OTP_TTL_SECONDS / SECONDS_PER_MINUTE;
  return `Your login code is ${code}. It expires in ${minutes} minutes.`;
}

@Injectable()
export class OtpService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    private readonly events: EventPublisher,
    private readonly store: OtpStore,
  ) {}

  async requestCode(identifier: string): Promise<void> {
    // the cooldown covers unknown identifiers too, so a 429 says nothing about which accounts exist
    if (!(await this.store.startCooldown(identifier))) {
      throw new HttpException(OTP_COOLDOWN, HttpStatus.TOO_MANY_REQUESTS);
    }

    try {
      await this.sendCode(identifier);
    } catch (error) {
      // a failure on our side shouldn't stop the user from retrying straight away
      await this.store.clearCooldown(identifier);
      throw error;
    }
  }

  async verifyCode({
    identifier,
    code,
  }: VerifyOtpDto): Promise<AuthResponseDto> {
    if (!(await this.store.verify(identifier, code))) {
      throw new UnauthorizedException(INVALID_OTP);
    }

    const user = await this.users.findByIdentifier(identifier);
    if (!user) {
      throw new UnauthorizedException(INVALID_OTP);
    }
    return this.tokens.issue(user);
  }

  private async sendCode(identifier: string): Promise<void> {
    const user = await this.users.findByIdentifier(identifier);
    // same response for unknown users so this can't be used to enumerate accounts
    if (!user) {
      return;
    }

    const code = await this.store.createCode(identifier);
    await this.events.publishNotification({
      channel: isEmail(identifier) ? 'email' : 'sms',
      to: identifier,
      message: loginCodeMessage(code),
    });
  }
}
