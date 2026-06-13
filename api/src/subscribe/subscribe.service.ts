import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SubscribeDto } from './dto';

@Injectable()
export class SubscribeService {
  private readonly logger = new Logger(SubscribeService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Always returns ok to the client; storage is best-effort and de-duped by email.
  async subscribe(dto: SubscribeDto): Promise<{ ok: boolean }> {
    if (!this.prisma.enabled) return { ok: true };
    const email = dto.email.trim().toLowerCase();
    try {
      await this.prisma.subscriber.upsert({
        where: { email },
        update: { source: dto.source ?? undefined },
        create: { email, source: dto.source ?? null },
      });
    } catch (e) {
      this.logger.warn(`subscribe failed: ${(e as Error).message}`);
    }
    return { ok: true };
  }
}
