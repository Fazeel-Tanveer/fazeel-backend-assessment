import { Module } from '@nestjs/common';
import { MessagingModule } from '../../infra/messaging/messaging.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { OtpController } from './otp.controller.js';
import { OtpService } from './otp.service.js';
import { OtpStore } from './otp.store.js';
import { TokenService } from './token.service.js';

@Module({
  imports: [UsersModule, MessagingModule],
  controllers: [AuthController, OtpController],
  providers: [AuthService, TokenService, OtpService, OtpStore],
})
export class AuthModule {}
