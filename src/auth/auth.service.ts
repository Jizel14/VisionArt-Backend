import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const payload = { sub: user.id, email: user.email };
    const access_token = this.jwtService.sign(payload);
    return { access_token, user: { id: user.id, email: user.email, name: user.name } };
  }

  async register(email: string, password: string, name: string) {
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.usersService.create({ email, passwordHash, name });
    const payload = { sub: user.id, email: user.email };
    const access_token = this.jwtService.sign(payload);
    return { access_token, user: { id: user.id, email: user.email, name: user.name } };
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    return { id: user.id, email: user.email, name: user.name };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const current = await this.usersService.findById(userId);
    if (!current) throw new UnauthorizedException('User not found');
    if (dto.email != null && dto.email.toLowerCase() !== current.email) {
      const existing = await this.usersService.findByEmail(dto.email);
      if (existing && existing.id !== userId) {
        throw new ConflictException('Email already in use');
      }
    }
    const user = await this.usersService.update(userId, {
      name: dto.name,
      email: dto.email,
    });
    if (!user) throw new UnauthorizedException('User not found');
    return { id: user.id, email: user.email, name: user.name };
  }
}
