import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  /**
   * Throws 403 ACCOUNT_BANNED when `bannedUntil` is still in the future.
   */
  assertNotBanned(user: User): void {
    if (!user.bannedUntil) return;
    const until = new Date(user.bannedUntil).getTime();
    if (until > Date.now()) {
      throw new HttpException(
        {
          code: 'ACCOUNT_BANNED',
          message: 'Compte temporairement suspendu.',
          bannedUntil: new Date(user.bannedUntil).toISOString(),
        },
        HttpStatus.FORBIDDEN,
      );
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email: email.toLowerCase() },
    });
  }

  async create(data: {
    email: string;
    passwordHash: string;
    name: string;
  }): Promise<User> {
    const user = this.userRepository.create({
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash,
      name: data.name,
    });
    return this.userRepository.save(user);
  }

  /**
   * Record a successful login.
   * Shifts `lastLoginAt` -> `previousLoginAt` and stamps the new login time.
   * Used by the retention engine to detect "RETURNING" users.
   */
  async markLogin(id: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id },
      select: ['id', 'lastLoginAt'],
    });
    if (!user) return;
    const now = new Date();
    await this.userRepository.update(id, {
      previousLoginAt: user.lastLoginAt,
      lastLoginAt: now,
      lastActiveAt: now,
    });
  }

  /**
   * Lightweight activity touch — called by the JwtAuthGuard on every request.
   * Throttled to once every 5 min via in-memory cache to avoid hot-row contention.
   */
  private readonly _lastActiveCache = new Map<string, number>();
  async touchActive(id: string): Promise<void> {
    const now = Date.now();
    const last = this._lastActiveCache.get(id) ?? 0;
    if (now - last < 5 * 60 * 1000) return;
    this._lastActiveCache.set(id, now);
    await this.userRepository.update(id, { lastActiveAt: new Date(now) });
  }

  async update(
    id: string,
    data: {
      name?: string;
      email?: string;
      bio?: string | null;
      avatarUrl?: string | null;
      phoneNumber?: string | null;
      website?: string | null;
    },
  ): Promise<User | null> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) return null;

    if (data.email) {
      const newEmail = data.email.toLowerCase();
      if (newEmail !== user.email) {
        const existing = await this.userRepository.findOne({
          where: { email: newEmail },
        });
        if (existing && existing.id !== id) return null; // email taken
        user.email = newEmail;
      }
    }

    if (data.name != null) user.name = data.name;
    if ('bio' in data && data.bio !== undefined) user.bio = data.bio;
    if ('avatarUrl' in data && data.avatarUrl !== undefined)
      user.avatarUrl = data.avatarUrl;
    if ('phoneNumber' in data && data.phoneNumber !== undefined)
      user.phoneNumber = data.phoneNumber;
    if ('website' in data && data.website !== undefined)
      user.website = data.website;

    return this.userRepository.save(user);
  }
}
