import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import { AnalyzeController } from './analyze/analyze.controller';
import { AnalyzeService } from './analyze/analyze.service';
import { GeminiService } from './analyze/gemini.service';
import { SubscribeController } from './subscribe/subscribe.controller';
import { SubscribeService } from './subscribe/subscribe.service';

@Module({
  controllers: [AppController, AnalyzeController, SubscribeController],
  providers: [
    AppService,
    PrismaService,
    AnalyzeService,
    GeminiService,
    SubscribeService,
  ],
})
export class AppModule {}
