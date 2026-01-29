import { Controller, Post, Body, Patch , Param, ParseIntPipe} from '@nestjs/common';
import { FacturasService } from './factura.service';
import { SireService } from '../sire/sire.service';
import { UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express'
import { ImageRecognitionService } from './image-recognition.service';
// Importamos el Enum generado por Prisma
import { EstadoFactura } from '@prisma/client'; 
@Controller('facturas') // Esto significa que la dirección será: localhost:3000/facturas
export class FacturasController {

  constructor(
    private readonly facturasService: FacturasService,
    private readonly sireService: SireService,
    private readonly imageService: ImageRecognitionService 
  ) {}

  // Creamos la acción de "Recibir" una factura
  @Post('registrar')
  async crearNuevaFactura(@Body() datos: any) {
    // Aquí recibimos los datos que envía la App
    console.log('Recibiendo factura:', datos);

    // Le pedimos al servicio que la guarde en la Base de Datos
    const facturaGuardada = await this.facturasService.registrarFactura(datos);

    // Respondemos a la App que todo salió bien
    return {
      mensaje: '¡Factura guardada con éxito!',
      id_generado: facturaGuardada.idFactura,
      estado_actual: facturaGuardada.estado
    };
  }
  
  @Post('consultar-sunat')
  async consultarSunat(@Body() body: any) {
    // 1. Pedir el token a SUNAT
    const token = await this.sireService.obtenerToken(
      body.ruc, 
      body.usuarioSol, 
      body.claveSol
    );

    // 2. Traer las facturas de ese periodo (ej: '202601')
    const facturasSunat = await this.sireService.consultarFacturas(
      token, 
      body.periodo
    );

    // 3. (Opcional) Aquí podrías llamar a tu FacturasService para guardarlas en la BD automáticamente
    
    return {
      mensaje: `Se encontraron ${facturasSunat.length} facturas en SUNAT`,
      data: facturasSunat
    };
  }

  

  @Post('reconocer-foto')
  @UseInterceptors(FileInterceptor('file'))
  async reconocerFoto(@UploadedFile() file: Express.Multer.File) {
    // 1. "Leemos" la imagen (ahora con el simulador)
    const datosExtraidos = await this.imageService.analizarImagen(
      file.buffer, 
      file.mimetype
    );

    // 2. GUARDADO AUTOMÁTICO: Lo metemos a la DB usando tu FacturasService
    const facturaGuardada = await this.facturasService.registrarFactura({
      ruc: datosExtraidos.ruc,
      numero: datosExtraidos.numero,
      monto: datosExtraidos.monto,
      fecha: new Date(datosExtraidos.fecha),
      // Si tu base de datos no tiene razonSocial, este campo se ignora
    });

    return {
      mensaje: "IA simulada: Datos extraídos y guardados en DB",
      data: facturaGuardada
    };
  }

    @Patch(':id/estado')
    async actualizarEstado(
      @Param('id', ParseIntPipe) id: number, 
      @Body('estado') nuevoEstado: EstadoFactura // Usamos el Enum para seguridad
    ) {
      // Esto permite que cuando CasaMarket confirme el registro, 
      // tú cambies el estado a 'REGISTRADO'
      const actualizada = await this.facturasService.actualizarEstado(id, nuevoEstado);
      return {
        mensaje: `Factura actualizada a ${nuevoEstado}`,
        data: actualizada
      };
    }
  
}