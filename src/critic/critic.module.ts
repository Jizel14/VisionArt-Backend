import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CriticService } from './critic.service';
import { CriticController } from './critic.controller';

@Module({
    imports: [ConfigModule],
    controllers: [CriticController],
    providers: [CriticService],
})
export class CriticModule { }
