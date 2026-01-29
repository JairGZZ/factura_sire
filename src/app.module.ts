import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { FacturaModule } from './factura/factura.module';
import { SireModule } from './sire/sire.module';

@Module({
  imports: [
    PrismaModule,
    FacturaModule,
    SireModule,
  ],
})
export class AppModule {}
