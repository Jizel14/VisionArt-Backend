import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Story } from '../social/stories/entities/story.entity';

@Injectable()
export class StoriesSeeder {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Story)
    private storyRepository: Repository<Story>,
  ) {}

  async seed(options?: {
    clearExisting?: boolean;
    maxStoriesPerUser?: number;
  }): Promise<void> {
    const clearExisting = options?.clearExisting ?? true;
    const maxStoriesPerUser = Math.min(
      Math.max(options?.maxStoriesPerUser ?? 3, 1),
      10,
    );

    console.log('🌱 Starting stories seeder...');

    if (clearExisting) {
      await this.storyRepository.query('DELETE FROM stories');
      console.log('🗑️ Cleared existing stories');
    }

    const users = await this.userRepository.find({
      select: ['id'],
      order: { createdAt: 'DESC' },
    });

    if (!users.length) {
      console.log('ℹ️ No users found; nothing to seed');
      return;
    }

    const now = Date.now();
    const expiresInMs = 24 * 60 * 60 * 1000;

    const stories: Story[] = [];

    for (const user of users) {
      const storiesCount = 1 + Math.floor(Math.random() * maxStoriesPerUser);

      for (let i = 0; i < storiesCount; i++) {
        const seed = `${user.id}-${i + 1}`;
        const mediaUrl = `https://picsum.photos/seed/visionart-${seed}/1080/1920`;

        stories.push(
          this.storyRepository.create({
            userId: user.id,
            mediaUrl,
            expiresAt: new Date(now + expiresInMs),
          }),
        );
      }
    }

    await this.storyRepository.save(stories);

    console.log(`✅ Created ${stories.length} stories`);
    console.log('🎉 Stories seeder completed successfully!');
  }
}
