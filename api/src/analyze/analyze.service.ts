import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GeminiService } from './gemini.service';
import { PrismaService } from '../prisma.service';
import { ScanDto, ScanResult } from './dto';

function stripDataUrl(s: string): { mime: string; data: string } {
  const m = /^data:(image\/[a-zA-Z]+);base64,(.*)$/.exec(s);
  return m ? { mime: m[1], data: m[2] } : { mime: 'image/jpeg', data: s };
}

@Injectable()
export class AnalyzeService {
  private readonly logger = new Logger(AnalyzeService.name);

  constructor(
    private readonly gemini: GeminiService,
    private readonly prisma: PrismaService,
  ) {}

  async analyze(dto: ScanDto): Promise<ScanResult> {
    const { mime, data } = stripDataUrl(dto.image);
    const result = await this.gemini.analyze(data, mime);

    // Persist the derived estimate (never the raw photo). Best-effort.
    if (this.prisma.enabled) {
      try {
        await this.prisma.scan.create({
          data: {
            totalProtein: Math.round(result.totalProtein) || 0,
            totalLeucine: Number(result.totalLeucine) || 0,
            items: result.items as unknown as Prisma.InputJsonValue,
            verdict: result.verdict,
            summary: result.summary,
            confidence: result.confidence,
            email: dto.email ?? null,
            sessionId: dto.sessionId ?? null,
          },
        });
      } catch (e) {
        this.logger.warn(`persist failed: ${(e as Error).message}`);
      }
    }
    return result;
  }
}
