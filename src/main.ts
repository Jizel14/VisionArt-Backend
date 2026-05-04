import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { VisionArtIoAdapter } from './socket-io.adapter';

async function bootstrap() {
  // rawBody: true is required for Stripe webhook signature verification
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useWebSocketAdapter(new VisionArtIoAdapter(app));
  app.enableCors({ origin: '*' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      // Query params are strings; convert to numbers before @IsInt() / @Min(1).
      transformOptions: { enableImplicitConversion: true },
    }),
  );

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

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
  console.log(`Listening on http://${host}:${port}`);
}
bootstrap();
