import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { StoriesSeeder } from './stories.seeder';

async function seedStories() {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const seeder = app.get(StoriesSeeder);
    await seeder.seed({ clearExisting: true, maxStoriesPerUser: 3 });
  } catch (error) {
    console.error('❌ Seed stories error:', error);
    process.exit(1);
  } finally {
    await app.close();
    process.exit(0);
  }
}

seedStories();
