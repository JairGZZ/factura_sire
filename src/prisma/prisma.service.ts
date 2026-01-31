import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Prisma conectado');
    } catch (error: any) {
      this.logger.error('Error conectando Prisma', error?.stack || error?.message || error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      this.logger.log('Prisma desconectado');
    } catch (error: any) {
      this.logger.error('Error desconectando Prisma', error?.stack || error?.message || error);
    }
  }
}
