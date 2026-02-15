import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PlaygroundSeeder } from './playground.seeder';

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const seeder = app.get(PlaygroundSeeder);
    await seeder.seed();
  } catch (error) {
    console.error('❌ Seed error:', error);
    process.exit(1);
  } finally {
    await app.close();
    process.exit(0);
  }
}

seed();
