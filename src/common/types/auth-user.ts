import type { Request } from 'express';
import type { Role } from '../../generated/prisma/enums.js';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

export interface AuthUser {
  id: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}
