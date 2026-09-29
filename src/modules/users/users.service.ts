import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user.js';
import { isEmail } from '../../common/utils/identifier.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { UserResponseDto } from './dto/user-response.dto.js';

export interface NewUser {
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
}

export interface UserCredentials extends AuthUser {
  passwordHash: string;
}

const PROFILE_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

function byIdentifier(identifier: string): Prisma.UserWhereUniqueInput {
  return isEmail(identifier) ? { email: identifier } : { phone: identifier };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: NewUser): Promise<AuthUser> {
    return this.prisma.user.create({
      data,
      select: { id: true, role: true },
    });
  }

  findCredentials(identifier: string): Promise<UserCredentials | null> {
    return this.prisma.user.findUnique({
      where: byIdentifier(identifier),
      select: { id: true, role: true, passwordHash: true },
    });
  }

  findByIdentifier(identifier: string): Promise<AuthUser | null> {
    return this.prisma.user.findUnique({
      where: byIdentifier(identifier),
      select: { id: true, role: true },
    });
  }

  async findProfile(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: PROFILE_SELECT,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
