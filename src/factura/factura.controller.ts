import { Controller, Post, Body, Patch , Param, ParseIntPipe, BadRequestException, Logger } from '@nestjs/common';
import { FacturasService } from './factura.service';
import { SireService } from '../sire/sire.service';
import { UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express'
import { ImageRecognitionService } from './image-recognition.service';


import { EstadoFactura } from '@prisma/client'; 
@Controller('facturas') // Esto significa que la dirección será: localhost:3000/facturas
export class FacturasController {

  private readonly logger = new Logger(FacturasController.name);

  constructor(
    private readonly facturasService: FacturasService,
    private readonly sireService: SireService,
    private readonly imageService: ImageRecognitionService 
  ) {}

  // Creamos la acción de "Recibir" una factura
  @Post('registrar')
  async crearNuevaFactura(@Body() datos: any) {
    this.logger.log('Recibiendo factura', { payloadSummary: { numero: datos?.numero, proveedorRuc: datos?.proveedorRuc } });
    try {
      // Le pedimos al servicio que la guarde en la Base de Datos
      const facturaGuardada = await this.facturasService.registrarFactura(datos);

      this.logger.log(`Factura guardada con id=${facturaGuardada.idFactura}`);

      // Respondemos a la App que todo salió bien
      return {
        mensaje: '¡Factura guardada con éxito!',
        id_generado: facturaGuardada.idFactura,
        estado_actual: facturaGuardada.estado
      };
    } catch (error: any) {
      this.logger.error('Error guardando factura', error?.stack || error?.message || error);
      throw new BadRequestException(error?.message || 'Error al guardar la factura');
    }
  }
  
@Post('consultar-sunat')
async consultarSunat(@Body() body: any) {
  const { ruc, usuarioSol, claveSol, periodo } = body;

  try {
  this.logger.log('Iniciando flujo SUNAT', { ruc, periodo });
  // 1. Obtener el Token
  const token = await this.sireService.obtenerToken(ruc, usuarioSol, claveSol);
  this.logger.log('Token obtenido', { tokenPresent: !!token });

    // 2. Solicitar el Ticket
    const ticketInfo = await this.sireService.solicitarTicket(token, periodo);
    const numTicket = ticketInfo.numTicket;

    // 3. Polling: Esperar procesamiento de SUNAT
    await new Promise(resolve => setTimeout(resolve, 3000));
    let respuestaEstado = await this.sireService.consultarEstadoTicket(token, numTicket, periodo);
    
    // Verificamos el primer registro del array
    let registroPrincipal = respuestaEstado.registros[0];

    // Si aún no termina (Estado '06' es Terminado en SUNAT)
    if (registroPrincipal.desEstadoProceso !== 'Terminado') {
      await new Promise(resolve => setTimeout(resolve, 3000));
      respuestaEstado = await this.sireService.consultarEstadoTicket(token, numTicket, periodo);
      registroPrincipal = respuestaEstado.registros[0];
    }

    // 4. Descarga final si el estado es correcto
    if (registroPrincipal.desEstadoProceso === 'Terminado') {
      const contenidoTxt = await this.sireService.descargarYDescomprimirPropuesta(
        token, 
        respuestaEstado // Pasamos el JSON completo para extraer los nuevos parámetros de la URL
      );

      return {
        success: true,
        mensaje: `Propuesta del periodo ${periodo} obtenida`,
        ticket: numTicket,
        data: contenidoTxt 
      };
    } else {
      return {
        success: false,
        mensaje: "SUNAT sigue procesando el ticket.",
        ticket: numTicket,
        estadoActual: registroPrincipal.desEstadoProceso
      };
    }

    } catch (error: any) {
      this.logger.error('Error en flujo SUNAT', error?.stack || error?.message || error);
      throw new BadRequestException(error?.message || 'Error en flujo SUNAT');
    }
}


  /*

  @Post('reconocer-foto')
  @UseInterceptors(FileInterceptor('file'))
  async reconocerFoto(@UploadedFile() file: Express.Multer.File) {
    const datosExtraidos = await this.imageService.analizarImagen(file.buffer, file.mimetype);

    // Si la IA falló por el "type of texture" de la imagen, evitamos el error de undefined
    if (!datosExtraidos || !datosExtraidos.ruc) {
      throw new BadRequestException("No se pudo extraer el RUC de la imagen. Intenta con una foto más clara.");
    }

    // Ahora sí, el código sigue seguro...
    const facturaGuardada = await this.facturasService.registrarFactura({
      ruc: datosExtraidos.ruc,
      numero: datosExtraidos.numero,
      monto: datosExtraidos.monto,
      fecha: new Date(datosExtraidos.fecha),
      // Si tu base de datos no tiene razonSocial, este campo se ignora
    });

    return { mensaje: "Éxito", data: facturaGuardada };
  }*/

@Post('reconocer-foto')
@UseInterceptors(FileInterceptor('file'))
async reconocerFoto(@UploadedFile() file: Express.Multer.File) {
  if (!file) throw new BadRequestException("No se subió ningún archivo.");
  this.logger.log('Archivo recibido para reconocimiento', { filename: file.originalname, size: file.size });
  try {
    // Ahora solo pasamos el buffer, ya no hace falta el mimetype para Tesseract
    const resultado = await this.imageService.analizarImagen(file.buffer);
    this.logger.log('Resultado análisis de imagen', { resultSummary: { ruc: resultado?.ruc, numero: resultado?.numero } });
    return {
      mensaje: "Análisis completado",
      data: resultado
    };
  } catch (error: any) {
    this.logger.error('Error al analizar imagen', error?.stack || error?.message || error);
    throw new BadRequestException(error?.message || 'Error al analizar la imagen');
  }
}

    @Patch(':id/estado')
    async actualizarEstado(
      @Param('id', ParseIntPipe) id: number, 
      @Body('estado') nuevoEstado: EstadoFactura // Usamos el Enum para seguridad
    ) {
      this.logger.log(`Actualizando estado de factura id=${id} -> ${nuevoEstado}`);
      try {
        // Esto permite que cuando CasaMarket confirme el registro, 
        // tú cambies el estado a 'REGISTRADO'
        const actualizada = await this.facturasService.actualizarEstado(id, nuevoEstado);
        this.logger.log(`Factura id=${id} actualizada con éxito`);
        return {
          mensaje: `Factura actualizada a ${nuevoEstado}`,
          data: actualizada
        };
      } catch (error: any) {
        this.logger.error('Error actualizando estado de factura', error?.stack || error?.message || error);
        throw new BadRequestException(error?.message || 'Error actualizando estado');
      }
    }
  
}