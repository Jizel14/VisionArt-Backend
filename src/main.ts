import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true is required for Stripe webhook signature verification
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('VisionArt API')
    .setDescription('Auth and user API')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth')
    .addTag('subscriptions')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
