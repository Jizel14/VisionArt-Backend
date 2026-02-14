import { Injectable } from '@nestjs/common';
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
        if (existing && existing.id !== id) return null; // email taken
        user.email = newEmail;
      }
    }

    if (data.name != null) user.name = data.name;

    return this.userRepository.save(user);
  }
}
