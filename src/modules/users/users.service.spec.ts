import { NotFoundException } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import { UsersService } from './users.service.js';

const USER_ID = '01920000-0000-7000-8000-000000000200';

function createService() {
  const user = {
    create: vi.fn(),
    findUnique: vi.fn(),
  };
  const service = new UsersService({ user } as unknown as PrismaService);

  return { service, user };
}

describe('UsersService', () => {
  it('creates a user and returns only its id and role', async () => {
    const { service, user } = createService();
    user.create.mockResolvedValue({ id: USER_ID, role: Role.USER });
    const data = {
      name: 'Alice',
      email: 'alice@example.com',
      phone: '+15551234567',
      passwordHash: 'hashed',
    };

    const created = await service.create(data);

    expect(created).toEqual({ id: USER_ID, role: Role.USER });
    expect(user.create).toHaveBeenCalledWith({
      data,
      select: { id: true, role: true },
    });
  });

  it('looks up credentials by email when the identifier has an @', async () => {
    const { service, user } = createService();
    user.findUnique.mockResolvedValue(null);

    await service.findCredentials('alice@example.com');

    expect(user.findUnique).toHaveBeenCalledWith({
      where: { email: 'alice@example.com' },
      select: { id: true, role: true, passwordHash: true },
    });
  });

  it('looks up credentials by phone otherwise', async () => {
    const { service, user } = createService();
    user.findUnique.mockResolvedValue(null);

    await service.findCredentials('+15551234567');

    expect(user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { phone: '+15551234567' } }),
    );
  });

  it('finds a user id and role by identifier without the password hash', async () => {
    const { service, user } = createService();
    user.findUnique.mockResolvedValue({ id: USER_ID, role: Role.USER });

    const found = await service.findByIdentifier('+15551234567');

    expect(found).toEqual({ id: USER_ID, role: Role.USER });
    expect(user.findUnique).toHaveBeenCalledWith({
      where: { phone: '+15551234567' },
      select: { id: true, role: true },
    });
  });

  it('returns the profile without the password hash', async () => {
    const { service, user } = createService();
    const profile = {
      id: USER_ID,
      name: 'Alice',
      email: 'alice@example.com',
      phone: '+15551234567',
      role: Role.USER,
      createdAt: new Date(),
    };
    user.findUnique.mockResolvedValue(profile);

    await expect(service.findProfile(USER_ID)).resolves.toEqual(profile);

    const [{ select }] = user.findUnique.mock.calls[0] as [
      { select: Record<string, boolean> },
    ];
    expect(select).not.toHaveProperty('passwordHash');
  });

  it('throws not found when the user no longer exists', async () => {
    const { service, user } = createService();
    user.findUnique.mockResolvedValue(null);

    await expect(service.findProfile(USER_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});
