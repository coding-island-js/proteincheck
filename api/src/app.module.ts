import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import { AnalyzeController } from './analyze/analyze.controller';
import { AnalyzeService } from './analyze/analyze.service';
import { GeminiService } from './analyze/gemini.service';

@Module({
  controllers: [AppController, AnalyzeController],
  providers: [AppService, PrismaService, AnalyzeService, GeminiService],
})
export class AppModule {}
