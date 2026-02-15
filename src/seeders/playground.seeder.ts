import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/user.entity';

import { Artwork } from '../social/artworks/entities/artwork.entity';
import { UserFollower } from '../social/follow/entities/user-follower.entity';
import { ArtworkLike } from '../social/artworks/entities/artwork-like.entity';
import { ArtworkComment } from '../social/artworks/entities/artwork-comment.entity';
import { UserPreferences } from 'src/user-preferences/entities/user-preferences.entity';

@Injectable()
export class PlaygroundSeeder {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserPreferences)
    private preferencesRepository: Repository<UserPreferences>,
    @InjectRepository(Artwork)
    private artworkRepository: Repository<Artwork>,
    @InjectRepository(UserFollower)
    private followerRepository: Repository<UserFollower>,
    @InjectRepository(ArtworkLike)
    private likeRepository: Repository<ArtworkLike>,
    @InjectRepository(ArtworkComment)
    private commentRepository: Repository<ArtworkComment>,
  ) {}

  async seed(): Promise<void> {
    console.log('🌱 Starting playground seeder...');

    // Clear existing data
    await this.clearData();

    // Create 10 users with rich profiles
    const users = await this.createUsers();
    console.log(`✅ Created ${users.length} users`);

    // Create user preferences for each user
    await this.createPreferences(users);
    console.log(`✅ Created preferences for ${users.length} users`);

    // Create follow relationships
    await this.createFollowRelationships(users);
    console.log(`✅ Created follow relationships`);

    // Create artworks
    const artworks = await this.createArtworks(users);
    console.log(`✅ Created ${artworks.length} artworks`);

    // Create likes on artworks
    await this.createLikes(users, artworks);
    console.log(`✅ Created likes on artworks`);

    // Create comments on artworks
    await this.createComments(users, artworks);
    console.log(`✅ Created comments on artworks`);

    console.log('🎉 Playground seeder completed successfully!');
  }

  private async clearData(): Promise<void> {
    console.log('🗑️ Clearing existing data...');

    // Clear in dependent order (reverse of creation)
    await this.commentRepository.query('DELETE FROM artwork_comments');
    await this.likeRepository.query('DELETE FROM artwork_likes');
    await this.followerRepository.query('DELETE FROM user_followers');
    await this.artworkRepository.query('DELETE FROM artworks');
    await this.preferencesRepository.query('DELETE FROM user_preferences');
    await this.userRepository.query('DELETE FROM users');

    // Reset auto-increment
    await this.userRepository.query('ALTER TABLE users AUTO_INCREMENT = 1');
  }

  private async createUsers(): Promise<User[]> {
    const userData = [
      {
        email: 'user1@test.com',
        name: 'user1',
        password: 'TestPassword123!',
        bio: 'Demo account for feed preview',
        avatarUrl:
          'https://api.dicebear.com/9.x/avataaars/png?seed=user1&backgroundColor=b6e3f4',
        isVerified: true,
        isPrivateAccount: false,
      },
      {
        email: 'alex.artist@test.com',
        name: 'Alex Artist',
        password: 'TestPassword123!',
        bio: 'Digital artist exploring AI-generated abstract art',
        avatarUrl:
          'https://api.dicebear.com/9.x/avataaars/png?seed=alex&backgroundColor=b6e3f4',
        isVerified: true,
        isPrivateAccount: false,
      },
      {
        email: 'bella.creative@test.com',
        name: 'Bella Creative',
        password: 'TestPassword123!',
        bio: 'Creating surreal landscapes with AI assistance',
        avatarUrl:
          'https://api.dicebear.com/9.x/avataaars/png?seed=bella&backgroundColor=b6e3f4',
        isVerified: true,
        isPrivateAccount: false,
      },
      {
        email: 'carlos.designs@test.com',
        name: 'Carlos Designs',
        password: 'TestPassword123!',
        bio: 'UI/UX designer and digital artist',
        avatarUrl:
          'https://api.dicebear.com/9.x/avataaars/png?seed=carlos&backgroundColor=b6e3f4',
        isVerified: false,
        isPrivateAccount: false,
      },
      {
        email: 'diana.vault@test.com',
        name: 'Diana Vault',
        password: 'TestPassword123!',
        bio: 'Collecting rare digital art 🎨',
        avatarUrl:
          'https://api.dicebear.com/9.x/avataaars/png?seed=diana&backgroundColor=b6e3f4',
        isVerified: false,
        isPrivateAccount: true,
      },
      {
        email: 'ethan.vision@test.com',
        name: 'Ethan Vision',
        password: 'TestPassword123!',
        bio: 'Photographer + AI enthusiast experimenting with generative art',
        avatarUrl:
          'https://api.dicebear.com/9.x/avataaars/png?seed=ethan&backgroundColor=b6e3f4',
        isVerified: true,
        isPrivateAccount: false,
      },
      {
        email: 'fiona.flux@test.com',
        name: 'Fiona Flux',
        password: 'TestPassword123!',
        bio: 'Exploring the intersection of technology and creativity',
        avatarUrl:
          'https://api.dicebear.com/9.x/avataaars/png?seed=fiona&backgroundColor=b6e3f4',
        isVerified: false,
        isPrivateAccount: false,
      },
      {
        email: 'grace.gallery@test.com',
        name: 'Grace Gallery',
        password: 'TestPassword123!',
        bio: 'Art curator and community builder 🌟',
        avatarUrl:
          'https://api.dicebear.com/9.x/avataaars/png?seed=grace&backgroundColor=b6e3f4',
        isVerified: true,
        isPrivateAccount: false,
      },
      {
        email: 'henry.hues@test.com',
        name: 'Henry Hues',
        password: 'TestPassword123!',
        bio: 'Color science and visual effects artist',
        avatarUrl:
          'https://api.dicebear.com/9.x/avataaars/png?seed=henry&backgroundColor=b6e3f4',
        isVerified: false,
        isPrivateAccount: false,
      },
      {
        email: 'iris.infinity@test.com',
        name: 'Iris Infinity',
        password: 'TestPassword123!',
        bio: 'Pushing the boundaries of what AI art can be',
        avatarUrl:
          'https://api.dicebear.com/9.x/avataaars/png?seed=iris&backgroundColor=b6e3f4',
        isVerified: true,
        isPrivateAccount: false,
      },
      {
        email: 'jack.journey@test.com',
        name: 'Jack Journey',
        password: 'TestPassword123!',
        bio: 'Travel photographer integrating AI for creative storytelling',
        avatarUrl:
          'https://api.dicebear.com/9.x/avataaars/png?seed=jack&backgroundColor=b6e3f4',
        isVerified: false,
        isPrivateAccount: false,
      },
    ];

    const users: User[] = [];

    for (const data of userData) {
      const hashedPassword = await bcrypt.hash(data.password, 10);

      const user = this.userRepository.create({
        email: data.email,
        name: data.name,
        passwordHash: hashedPassword,
        bio: data.bio,
        avatarUrl: data.avatarUrl,
        isVerified: data.isVerified,
        isPrivateAccount: data.isPrivateAccount,
        followersCount: 0,
        followingCount: 0,
        publicGenerationsCount: 0,
      });

      const saved = await this.userRepository.save(user);
      users.push(saved);
    }

    return users;
  }

  private async createPreferences(users: User[]): Promise<void> {
    const themes: Array<'light' | 'dark' | 'auto'> = ['light', 'dark', 'auto'];
    const languages: Array<'fr' | 'en' | 'ar'> = ['fr', 'en', 'ar'];
    const qualities: Array<'fast' | 'balanced' | 'quality'> = [
      'fast',
      'balanced',
      'quality',
    ];
    const complexities: Array<'minimal' | 'moderate' | 'detailed'> = [
      'minimal',
      'moderate',
      'detailed',
    ];

    for (const user of users) {
      const preferences = this.preferencesRepository.create({
        userId: user.id,
        theme: themes[Math.floor(Math.random() * themes.length)],
        preferredLanguage:
          languages[Math.floor(Math.random() * languages.length)],
        notificationsEnabled: true,
        emailNotificationsEnabled: false,
        enableNSFWFilter: true,
        generationQuality:
          qualities[Math.floor(Math.random() * qualities.length)],
        artComplexity:
          complexities[Math.floor(Math.random() * complexities.length)],
        enableLocationContext: false,
        enableWeatherContext: false,
        enableCalendarContext: false,
        enableMusicContext: false,
        enableTimeContext: true,
        defaultResolution: '1024x1024',
        defaultAspectRatio: 'square',
        dataRetentionPeriod: 365,
        allowDataForTraining: true,
        shareGenerationsPublicly: !user.isPrivateAccount,
      });

      await this.preferencesRepository.save(preferences);
    }
  }

  private async createFollowRelationships(users: User[]): Promise<void> {
    // User 0 (demo user1) follows everyone else
    const demoUser = users[0];
    for (let i = 1; i < users.length; i++) {
      const follower = this.followerRepository.create({
        followerId: demoUser.id,
        followingId: users[i].id,
      });

      await this.followerRepository.save(follower);

      // Update counts
      await this.userRepository.increment(
        { id: demoUser.id },
        'followingCount',
        1,
      );
      await this.userRepository.increment(
        { id: users[i].id },
        'followersCount',
        1,
      );
    }

    // Create cross-follow patterns for other users
    const patterns = [
      [], // User 0 (demo) - already handled above
      [2, 3, 5, 7, 9], // User 1 follows
      [1, 3, 4, 8], // User 2 follows
      [1, 2, 5, 6], // User 3 follows
      [1, 2, 3, 7, 9], // User 4 follows
      [2, 4, 6, 8], // User 5 follows
      [1, 2, 3, 5, 9], // User 6 follows
      [3, 4, 6, 8], // User 7 follows
      [1, 2, 4, 7, 9], // User 8 follows
      [2, 3, 5, 7, 8], // User 9 follows
    ];

    for (let i = 1; i < users.length && i < patterns.length; i++) {
      const followingIndices = patterns[i] || [];

      for (const followingIndex of followingIndices) {
        if (followingIndex < users.length && followingIndex !== i) {
          const existing = await this.followerRepository.findOne({
            where: {
              followerId: users[i].id,
              followingId: users[followingIndex].id,
            },
          });

          if (!existing) {
            const follower = this.followerRepository.create({
              followerId: users[i].id,
              followingId: users[followingIndex].id,
            });

            await this.followerRepository.save(follower);

            // Update counts
            await this.userRepository.increment(
              { id: users[i].id },
              'followingCount',
              1,
            );
            await this.userRepository.increment(
              { id: users[followingIndex].id },
              'followersCount',
              1,
            );
          }
        }
      }
    }
  }

  private async createArtworks(users: User[]): Promise<Artwork[]> {
    const artworks: Artwork[] = [];
    const samples = [
      {
        title: 'Neon Dreams',
        description: 'A vibrant exploration of cyberpunk aesthetics',
        prompt: {
          text: 'neon cyberpunk city at night, glowing signs, rain reflections',
          style: 'digital art',
          mood: 'cyberpunk',
        },
        imageUrl: 'https://picsum.photos/400/400?random=1',
        thumbnailUrl: 'https://picsum.photos/200/200?random=1',
      },
      {
        title: 'Serene Mountain Lake',
        description: 'Peaceful landscape at sunrise',
        prompt: {
          text: 'misty mountain lake at dawn, golden light, calm water',
          style: 'landscape photography',
          mood: 'peaceful',
        },
        imageUrl: 'https://picsum.photos/400/400?random=2',
        thumbnailUrl: 'https://picsum.photos/200/200?random=2',
      },
      {
        title: 'Abstract Consciousness',
        description: 'Digital representation of thought and emotion',
        prompt: {
          text: 'abstract swirling colors, consciousness visualization, ethereal',
          style: 'abstract art',
          mood: 'philosophical',
        },
        imageUrl: 'https://picsum.photos/400/400?random=3',
        thumbnailUrl: 'https://picsum.photos/200/200?random=3',
      },
      {
        title: 'Retro Future',
        description: 'Blending vintage and futuristic elements',
        prompt: {
          text: '1980s retro car in futuristic neon city, synthwave',
          style: 'retro-future',
          mood: 'nostalgic',
        },
        imageUrl: 'https://picsum.photos/400/400?random=4',
        thumbnailUrl: 'https://picsum.photos/200/200?random=4',
      },
      {
        title: 'Deep Ocean',
        description: 'Exploration of underwater mysteries',
        prompt: {
          text: 'deep sea creatures, bioluminescence, dark water, mystery',
          style: 'fantasy illustration',
          mood: 'mysterious',
        },
        imageUrl: 'https://picsum.photos/400/400?random=5',
        thumbnailUrl: 'https://picsum.photos/200/200?random=5',
      },
      {
        title: 'Golden Wheat Fields',
        description: 'Rural serenity and natural beauty',
        prompt: {
          text: 'golden wheat field under blue sky, peaceful countryside',
          style: 'impressionist',
          mood: 'serene',
        },
        imageUrl: 'https://picsum.photos/400/400?random=6',
        thumbnailUrl: 'https://picsum.photos/200/200?random=6',
      },
      {
        title: 'Urban Jungle',
        description: 'Nature reclaiming the city',
        prompt: {
          text: 'overgrown city buildings covered in vines and plants',
          style: 'digital art',
          mood: 'dystopian',
        },
        imageUrl: 'https://picsum.photos/400/400?random=7',
        thumbnailUrl: 'https://picsum.photos/200/200?random=7',
      },
      {
        title: 'Crystalline Dreams',
        description: 'Geometric beauty and symmetry',
        prompt: {
          text: 'perfect geometric crystals, fractal patterns, vibrant colors',
          style: 'fractal art',
          mood: 'mesmerizing',
        },
        imageUrl: 'https://picsum.photos/400/400?random=8',
        thumbnailUrl: 'https://picsum.photos/200/200?random=8',
      },
    ];

    // Create 3 artworks per user so the feed is always populated
    for (let userIdx = 0; userIdx < users.length; userIdx++) {
      const count = 3;

      for (let j = 0; j < count; j++) {
        const sample = samples[(userIdx * 3 + j) % samples.length];
        const isPublic = true;

        const artwork = this.artworkRepository.create({
          userId: users[userIdx].id,
          title: `${sample.title} #${j + 1}`,
          description: sample.description,
          prompt: sample.prompt,
          imageUrl: `${sample.imageUrl}&t=${Date.now()}`,
          thumbnailUrl: `${sample.thumbnailUrl}&t=${Date.now()}`,
          isPublic,
          isNSFW: false,
          metadata: {
            model: 'stable-diffusion-3',
            steps: 50,
            cfgScale: 7.5,
          },
          likesCount: 0,
          commentsCount: 0,
          remixCount: 0,
        });

        const saved = await this.artworkRepository.save(artwork);
        artworks.push(saved);

        // Update user's public generations count
        if (isPublic) {
          await this.userRepository.increment(
            { id: users[userIdx].id },
            'publicGenerationsCount',
            1,
          );
        }
      }
    }

    return artworks;
  }

  private async createLikes(users: User[], artworks: Artwork[]): Promise<void> {
    // Each user likes 3-5 random artworks
    for (const user of users) {
      const likeCount = Math.floor(Math.random() * 3) + 3; // 3-5 likes

      for (let i = 0; i < likeCount; i++) {
        const randomArtwork =
          artworks[Math.floor(Math.random() * artworks.length)];

        // Check if already liked
        const existing = await this.likeRepository.findOne({
          where: {
            userId: user.id,
            artworkId: randomArtwork.id,
          },
        });

        if (!existing) {
          const like = this.likeRepository.create({
            userId: user.id,
            artworkId: randomArtwork.id,
          });

          await this.likeRepository.save(like);

          // Increment likes count
          await this.artworkRepository.increment(
            { id: randomArtwork.id },
            'likesCount',
            1,
          );
        }
      }
    }
  }

  private async createComments(
    users: User[],
    artworks: Artwork[],
  ): Promise<void> {
    const commentTexts = [
      'This is amazing! 🎨',
      'Love the colors and composition',
      'The prompt execution is perfect',
      'Really creative use of the style',
      'This inspired me to create something similar',
      'Beautiful work! The details are incredible',
      'How did you achieve this effect?',
      'This is what AI art should be',
      'Absolutely mind-blowing 🤯',
      'The lighting is just perfect',
    ];

    // Each artwork gets 1-3 comments
    for (const artwork of artworks) {
      if (!artwork.isPublic) continue; // Only comment on public artworks

      const commentCount = Math.floor(Math.random() * 3) + 1; // 1-3 comments

      for (let i = 0; i < commentCount; i++) {
        const randomUser = users[Math.floor(Math.random() * users.length)];
        const randomComment =
          commentTexts[Math.floor(Math.random() * commentTexts.length)];

        const comment = this.commentRepository.create({
          artworkId: artwork.id,
          userId: randomUser.id,
          content: randomComment,
          parentCommentId: null,
          isEdited: false,
        });

        await this.commentRepository.save(comment);

        // Increment comments count
        await this.artworkRepository.increment(
          { id: artwork.id },
          'commentsCount',
          1,
        );
      }
    }
  }
}
