import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import { OAuth2Client } from 'google-auth-library';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid email or password');
    if (user.provider === 'google') {
      throw new UnauthorizedException('This account uses Google sign-in. Use "Sign in with Google".');
    }
    if (!user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const payload = { sub: user.id, email: user.email };
    const access_token = this.jwtService.sign(payload);
    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        preferences: user.preferences ?? undefined,
      },
    };
  }

  async register(email: string, password: string, name: string) {
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      if (existing.provider === 'google') {
        throw new ConflictException('This email is already used with Google. Use "Sign in with Google".');
      }
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.usersService.create({ email, passwordHash, name });
    const payload = { sub: user.id, email: user.email };
    const access_token = this.jwtService.sign(payload);
    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        preferences: user.preferences ?? undefined,
      },
    };
  }

  async loginWithGoogle(idToken: string) {
    const rawToken = (idToken ?? '').trim();
    const webClientId = (this.config.get('GOOGLE_CLIENT_ID') ?? '').trim();
    const androidClientId = (this.config.get('GOOGLE_ANDROID_CLIENT_ID') ?? '').trim();
    const allowedAudiences = [webClientId, androidClientId].filter(Boolean);
    if (allowedAudiences.length === 0) {
      throw new BadRequestException('Google sign-in is not configured');
    }
    const client = new OAuth2Client();
    let payload: { sub: string; email?: string; name?: string };
    try {
      const ticket = await client.verifyIdToken({
        idToken: rawToken,
        audience: allowedAudiences.length === 1 ? allowedAudiences[0] : allowedAudiences,
      });
      payload = ticket.getPayload() as { sub: string; email?: string; name?: string };
      if (!payload?.sub) throw new Error('Invalid payload');
    } catch (err) {
      if (this.config.get('NODE_ENV') !== 'production' && err instanceof Error) {
        console.warn('Google token verification failed:', err.message);
      }
      throw new UnauthorizedException('Invalid Google token');
    }
    const googleId = payload.sub;
    const email = (payload.email ?? '').toLowerCase();
    const name = payload.name ?? payload.email?.split('@')[0] ?? 'User';
    if (!email) {
      throw new UnauthorizedException('Google account has no email');
    }
    let user = await this.usersService.findByGoogleId(googleId);
    if (!user) {
      const existing = await this.usersService.findByEmail(email);
      if (existing) {
        if (existing.provider === 'local') {
          throw new ConflictException(
            'An account already exists with this email. Sign in with email/password or use "Forgot password".',
          );
        }
        user = existing; // existing Google user, same email
      } else {
        user = await this.usersService.createGoogleUser({ email, name, googleId });
      }
    }
    const access_token = this.jwtService.sign({ sub: user.id, email: user.email });
    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        preferences: user.preferences ?? undefined,
      },
    };
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      preferences: user.preferences ?? undefined,
    };
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
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      preferences: user.preferences ?? undefined,
    };
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    const user = await this.usersService.updatePreferences(userId, {
      subjects: dto.subjects,
      styles: dto.styles,
      colors: dto.colors,
      mood: dto.mood,
      complexity: dto.complexity,
      permissions: dto.permissions,
      onboardingComplete: dto.onboardingComplete,
    });
    if (!user) throw new UnauthorizedException('User not found');
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      preferences: user.preferences ?? undefined,
    };
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // Don't reveal whether email exists
      return { message: 'If an account exists, a reset link will be sent.' };
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await this.usersService.setResetPasswordToken(user.email, token, expiresAt);

    const smtpHost = this.config.get('SMTP_HOST');
    const smtpUser = this.config.get('SMTP_USER');
    const smtpPass = this.config.get('SMTP_PASS');
    const mailFrom = this.config.get('MAIL_FROM') || smtpUser || 'noreply@visionart.app';
    const frontendResetUrl = this.config.get('FRONTEND_RESET_URL') || '';

    if (smtpHost && smtpUser && smtpPass) {
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: this.config.get('SMTP_PORT') || 587,
          secure: this.config.get('SMTP_SECURE') === 'true',
          auth: { user: smtpUser, pass: smtpPass },
        });
        // Token in path (not query) so email clients don't strip it
        const resetLink = frontendResetUrl
          ? `${frontendResetUrl.replace(/\/$/, '')}/${token}`
          : null;
        await transporter.sendMail({
          from: mailFrom,
          to: user.email,
          subject: 'VisionArt – Réinitialisation du mot de passe',
          text: resetLink
            ? `Bonjour,\n\nCliquez sur ce lien pour réinitialiser votre mot de passe (valide 1 h) :\n${resetLink}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.`
            : `Bonjour,\n\nVotre code de réinitialisation VisionArt (valide 1 h) :\n${token}\n\nUtilisez-le dans l'app pour définir un nouveau mot de passe. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`,
          html: resetLink
            ? `<!DOCTYPE html><html><body style="font-family:sans-serif"><p>Bonjour,</p><p>Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe (valide 1 h) :</p><p><a href="${resetLink}">Réinitialiser mon mot de passe</a></p><p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p></body></html>`
            : `<!DOCTYPE html><html><body style="font-family:sans-serif"><p>Bonjour,</p><p>Votre code de réinitialisation VisionArt (valide 1 h) :</p><p><strong>${token}</strong></p><p>Utilisez-le dans l'app pour définir un nouveau mot de passe.</p><p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p></body></html>`,
        });
      } catch (err) {
        // In dev, still return token so flow can be tested without email
        if (this.config.get('NODE_ENV') !== 'production') {
          return { message: 'Failed to send email; use this token for testing.', resetToken: token };
        }
        throw new BadRequestException('Could not send reset email. Please try again later.');
      }
      return { message: 'If an account exists, a reset link will be sent.' };
    }

    // No SMTP configured: in dev return token so you can test; in prod only generic message
    if (this.config.get('NODE_ENV') !== 'production') {
      return { message: 'Reset token generated (no email sent; configure SMTP to send emails).', resetToken: token };
    }
    return { message: 'If an account exists, a reset link will be sent.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const user = await this.usersService.updatePasswordByToken(token, passwordHash);
    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }
    return { message: 'Password has been reset.' };
  }

  async deleteAccount(userId: string): Promise<{ message: string }> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    const deleted = await this.usersService.delete(userId);
    if (!deleted) throw new BadRequestException('Account could not be deleted');
    return { message: 'Account has been permanently deleted.' };
  }
}
