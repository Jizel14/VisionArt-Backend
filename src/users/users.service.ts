import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserPreferencesData } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email: email.toLowerCase() },
    });
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { googleId } });
  }

  async findByResetToken(token: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { resetPasswordToken: token },
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
      provider: 'local',
      googleId: null,
    });
    return this.userRepository.save(user);
  }

  async createGoogleUser(data: {
    email: string;
    name: string;
    googleId: string;
  }): Promise<User> {
    const user = this.userRepository.create({
      email: data.email.toLowerCase(),
      passwordHash: null,
      name: data.name,
      provider: 'google',
      googleId: data.googleId,
    });
    return this.userRepository.save(user);
  }

  async update(
    id: string,
    data: { name?: string; email?: string },
  ): Promise<User | null> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) return null;

    if (data.email) {
      const newEmail = data.email.toLowerCase();
      if (newEmail !== user.email) {
        const existing = await this.userRepository.findOne({
          where: { email: newEmail },
        });
        if (existing && existing.id !== id) return null;
        user.email = newEmail;
      }
    }

    if (data.name != null) user.name = data.name;

    return this.userRepository.save(user);
  }

  async updatePreferences(id: string, preferences: UserPreferencesData): Promise<User | null> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) return null;
    user.preferences = { ...(user.preferences || {}), ...preferences };
    return this.userRepository.save(user);
  }

  async setResetPasswordToken(email: string, token: string, expiresAt: Date): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { email: email.toLowerCase() },
    });
    if (!user) return null;
    user.resetPasswordToken = token;
    user.resetPasswordExpires = expiresAt;
    return this.userRepository.save(user);
  }

  async updatePasswordByToken(token: string, passwordHash: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { resetPasswordToken: token },
    });
    if (!user) return null;
    if (!user.resetPasswordExpires || user.resetPasswordExpires < new Date()) return null;
    user.passwordHash = passwordHash;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    return this.userRepository.save(user);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.userRepository.delete(id);
    return (result.affected ?? 0) > 0;
  }
}
