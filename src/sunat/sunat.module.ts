import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SunatController } from './sunat.controller';
import { SunatService } from './sunat.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000, // 30 segundos timeout para llamadas HTTP
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  controllers: [SunatController],
  providers: [SunatService],
  exports: [SunatService],
})
export class SunatModule {}
