import { randomBytes } from 'node:crypto';
import {
  Injectable,
  type OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare, hash } from 'bcrypt';
import type { Env } from '../../config/env.validation.js';
import { UsersService } from '../users/users.service.js';
import { INVALID_CREDENTIALS } from './auth.constants.js';
import type { AuthResponseDto } from './dto/auth-response.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import { TokenService } from './token.service.js';

const DUMMY_PASSWORD_BYTES = 16;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly bcryptRounds: number;
  private dummyPasswordHash = '';

  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
    config: ConfigService<Env, true>,
  ) {
    this.bcryptRounds = config.get('BCRYPT_ROUNDS', { infer: true });
  }

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash = await hash(
      randomBytes(DUMMY_PASSWORD_BYTES).toString('hex'),
      this.bcryptRounds,
    );
  }

  async register({
    password,
    ...profile
  }: RegisterDto): Promise<AuthResponseDto> {
    const passwordHash = await hash(password, this.bcryptRounds);
    const user = await this.users.create({ ...profile, passwordHash });
    return this.tokens.issue(user);
  }

  async login({ identifier, password }: LoginDto): Promise<AuthResponseDto> {
    const user = await this.users.findCredentials(identifier);
    // unknown users still pay for a bcrypt compare so response time doesn't reveal which accounts exist
    const passwordMatches = await compare(
      password,
      user?.passwordHash ?? this.dummyPasswordHash,
    );
    if (!user || !passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return this.tokens.issue({ id: user.id, role: user.role });
  }
}
