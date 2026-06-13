import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma client wrapper. Connects on boot, but degrades gracefully: if no
 * DATABASE_URL / DB is reachable, the API still serves analyses (persistence
 * is just skipped). Keeps the demo alive even before Railway Postgres is wired.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  enabled = false;

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.enabled = true;
      this.logger.log('Connected to PostgreSQL');
    } catch (e) {
      this.logger.warn(
        `DB unavailable, persistence disabled: ${(e as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.enabled) await this.$disconnect();
  }
}
