import { Controller, Get, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { SunatService } from './sunat.service';

@Controller('sunat')
export class SunatController {
  constructor(private readonly sunatService: SunatService) {}

  /**
   * Endpoint para obtener el reporte de facturación de SUNAT
   * 
   * @param periodo - Período tributario en formato YYYYMM (ej: "202512")
   * @returns Contenido del archivo TXT con los comprobantes
   * 
   * @example
   * GET /sunat/facturas/202512
   */
  @Get('facturas/:periodo')
  @HttpCode(HttpStatus.OK)
  async getFacturas(@Param('periodo') periodo: string): Promise<{ 
    success: boolean;
    periodo: string;
    contenido: string;
  }> {
    // Validación básica del formato de período
    if (!/^\d{6}$/.test(periodo)) {
      throw new Error('El periodo debe tener formato YYYYMM (ej: 202512)');
    }

    const contenido = await this.sunatService.obtenerReporteFacturacion(periodo);

    return {
      success: true,
      periodo,
      contenido,
    };
  }
}
