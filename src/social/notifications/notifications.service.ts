import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotificationType,
  UserNotification,
} from './entities/user-notification.entity';
import { User } from '../../users/user.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(UserNotification)
    private notificationsRepository: Repository<UserNotification>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async createNotification(params: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    actorUserId?: string;
    artworkId?: string;
  }) {
    const notification = this.notificationsRepository.create({
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      actorUserId: params.actorUserId || null,
      artworkId: params.artworkId || null,
      isRead: false,
      readAt: null,
    });

    const saved = await this.notificationsRepository.save(notification);
    return saved;
  }

  async notifyFollow(params: {
    followerId: string;
    followerName: string;
    followedUserId: string;
  }) {
    if (params.followerId === params.followedUserId) return;

    await this.createNotification({
      userId: params.followedUserId,
      type: NotificationType.FOLLOW,
      title: 'New follower',
      message: `${params.followerName} started following you`,
      actorUserId: params.followerId,
    });
  }

  async notifyLike(params: {
    likerId: string;
    likerName: string;
    artworkOwnerId: string;
    artworkId: string;
    artworkTitle?: string | null;
  }) {
    if (params.likerId === params.artworkOwnerId) return;

    await this.createNotification({
      userId: params.artworkOwnerId,
      type: NotificationType.LIKE,
      title: 'New like',
      message: `${params.likerName} liked your artwork${params.artworkTitle ? `: ${params.artworkTitle}` : ''}`,
      actorUserId: params.likerId,
      artworkId: params.artworkId,
    });
  }

  async notifyComment(params: {
    commenterId: string;
    commenterName: string;
    artworkOwnerId: string;
    artworkId: string;
    artworkTitle?: string | null;
  }) {
    if (params.commenterId === params.artworkOwnerId) return;

    await this.createNotification({
      userId: params.artworkOwnerId,
      type: NotificationType.COMMENT,
      title: 'New comment',
      message: `${params.commenterName} commented on your artwork${params.artworkTitle ? `: ${params.artworkTitle}` : ''}`,
      actorUserId: params.commenterId,
      artworkId: params.artworkId,
    });
  }

  async getNotifications(userId: string, page: number = 1, limit: number = 20) {
    const [items, total] = await this.notificationsRepository.findAndCount({
      where: { userId },
      relations: ['actorUser', 'artwork'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        message: item.message,
        isRead: item.isRead,
        createdAt: item.createdAt,
        readAt: item.readAt,
        actorUser: item.actorUser
          ? {
              id: item.actorUser.id,
              name: item.actorUser.name,
              avatarUrl: item.actorUser.avatarUrl,
            }
          : null,
        artwork: item.artwork
          ? {
              id: item.artwork.id,
              title: item.artwork.title,
              imageUrl: item.artwork.imageUrl,
            }
          : null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUnreadCount(userId: string) {
    const count = await this.notificationsRepository.count({
      where: { userId, isRead: false },
    });

    return { unreadCount: count };
  }

  async markAsRead(userId: string, notificationId: string) {
    const item = await this.notificationsRepository.findOne({
      where: { id: notificationId, userId },
    });

    if (!item) {
      throw new NotFoundException('Notification not found');
    }

    if (!item.isRead) {
      item.isRead = true;
      item.readAt = new Date();
      await this.notificationsRepository.save(item);
    }

    return { success: true };
  }

  async markAllAsRead(userId: string) {
    await this.notificationsRepository
      .createQueryBuilder()
      .update(UserNotification)
      .set({ isRead: true, readAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('is_read = false')
      .execute();

    return { success: true };
  }
}
