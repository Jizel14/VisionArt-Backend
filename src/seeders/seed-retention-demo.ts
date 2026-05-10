import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { RetentionDemoSeeder } from './retention-demo.seeder';

async function seedRetentionDemo() {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const seeder = app.get(RetentionDemoSeeder);
    await seeder.seed();
  } catch (error) {
    console.error('❌ Seed retention demo error:', error);
    process.exit(1);
  } finally {
    await app.close();
    process.exit(0);
  }
}

seedRetentionDemo();

