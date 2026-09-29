import { Role } from '../../generated/prisma/enums.js';
import { UsersController } from './users.controller.js';
import type { UsersService } from './users.service.js';

describe('UsersController', () => {
  it('returns the profile of the current user', async () => {
    const profile = { id: 'user-id', name: 'Alice' };
    const users = { findProfile: vi.fn().mockResolvedValue(profile) };
    const controller = new UsersController(users as unknown as UsersService);

    const result = await controller.me({ id: 'user-id', role: Role.USER });

    expect(result).toBe(profile);
    expect(users.findProfile).toHaveBeenCalledWith('user-id');
  });
});
