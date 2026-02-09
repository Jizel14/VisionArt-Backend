import { Injectable } from '@nestjs/common';
import { User } from './user';

@Injectable()
export class UsersService {
  private users: Map<string, User> = new Map();
  private byEmail: Map<string, string> = new Map();

  async findById(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const id = this.byEmail.get(email.toLowerCase());
    return id ? this.users.get(id) : undefined;
  }

  async create(data: { email: string; passwordHash: string; name: string }): Promise<User> {
    const id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const user: User = {
      id,
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash,
      name: data.name,
    };
    this.users.set(id, user);
    this.byEmail.set(user.email, id);
    return user;
  }

  async update(id: string, data: { name?: string; email?: string }): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    if (data.name != null) user.name = data.name;
    if (data.email != null) {
      const newEmail = data.email.toLowerCase();
      if (newEmail !== user.email) {
        const existing = this.byEmail.get(newEmail);
        if (existing && existing !== id) return undefined; // email taken
        this.byEmail.delete(user.email);
        user.email = newEmail;
        this.byEmail.set(user.email, id);
      }
    }
    this.users.set(id, user);
    return user;
  }
}
