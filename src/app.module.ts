import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { FacturaModule } from './factura/factura.module';
import { SireModule } from './sire/sire.module';
import { SunatModule } from './sunat/sunat.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Hace que ConfigModule esté disponible globalmente
    }),
    PrismaModule,
    FacturaModule,
    SireModule,
    SunatModule,
  ],
})
export class AppModule {}

