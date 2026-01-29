import { Module } from '@nestjs/common';
import { FacturasController } from './factura.controller';
import { FacturasService } from './factura.service';
import { HttpModule } from '@nestjs/axios';
import { ImageRecognitionService } from './image-recognition.service';
import { SireModule } from '../sire/sire.module';

@Module({
  imports: [HttpModule, SireModule],
  controllers: [FacturasController],
  providers: [FacturasService, ImageRecognitionService],
})
export class FacturaModule {}
