import { Module } from '@nestjs/common';
import { YoutubeController } from './youtube.controller';
import { YoutubeService } from './youtube.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';

@Module({
  controllers: [YoutubeController],
  providers: [YoutubeService, PrismaService],
  exports: [YoutubeService],
})
export class YoutubeModule {}
