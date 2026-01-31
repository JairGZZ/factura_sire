import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EstadoFactura } from '@prisma/client';
import { SireService } from '../sire/sire.service'; // Apunta a la carpeta sire
@Injectable()
export class FacturasService {
  private readonly logger = new Logger(FacturasService.name);
  constructor(
    private prisma: PrismaService,
    private sireService: SireService,
  ) {}

  // --- REGISTRO FACTURA ---
async registrarFactura(data: any) {
  this.logger.log('Iniciando registrarFactura', { summary: { proveedorRuc: data?.proveedorRuc, numero: data?.numero } });

  // Aseguramos que el proveedor exista
  try {
    await this.prisma.proveedor.upsert({
    where: { rucProveedor: data.proveedorRuc },
    update: {}, // Si existe no hacemos nada
    create: { 
      rucProveedor: data.proveedorRuc,
      razonSocial: "Proveedor Genérico" // O el dato que tengas
    }
  });
  } catch (error: any) {
    this.logger.error('Error upsert proveedor', error?.stack || error?.message || error);
    throw error;
  }

  // Ahora sí creamos la factura
  try {
    const created = await this.prisma.factura.create({
      data: {
        numeroComprobante: data.numero,
        fechaEmision: new Date(data.fecha),
        total: data.total,
        estado: EstadoFactura.CONSULTADO,
        usuarioId: data.usuarioId,
        proveedorRuc: data.proveedorRuc,
      },
    });
    this.logger.log(`Factura creada id=${created.idFactura}`);
    return created;
  } catch (error: any) {
    this.logger.error('Error creando factura', error?.stack || error?.message || error);
    throw error;
  }
}

  // --- REGISTRO AUTOMÁTICO DESDE SIRE (La recomendación mejorada) ---
  async sincronizarFacturasSire(token: string, periodo: string, usuarioId: number) {
  this.logger.log('Sincronizando facturas Sire', { periodo, usuarioId });
  // 1. Llamamos al servicio que configuramos antes
  const data = await this.sireService.solicitarTicket(token, periodo);

    // 2. Recorremos las facturas que envió SUNAT
    const resultados = [];
    for (const item of data) {
  this.logger.log('Procesando item de SIRE', { itemSummary: { numSerie: item.numSerie, numComprobante: item.numComprobante } });
      const factura = await this.prisma.factura.upsert({
        where: { 
          // Suponiendo que numeroComprobante es único en tu DB
          numeroComprobante: `${item.numSerie}-${item.numComprobante}` 
        },
        update: {}, // Si existe, no cambiamos nada por ahora
        create: {
          numeroComprobante: `${item.numSerie}-${item.numComprobante}`,
          fechaEmision: new Date(item.fecEmision),
          total: item.mtoTotal,
          estado: EstadoFactura.CONSULTADO,
          usuarioId: usuarioId,
          proveedorRuc: item.numRucProveedor,
        },
      });
      resultados.push(factura);
    }
    return resultados;
  }

  // --- ACTUALIZACIÓN DE ESTADOS (Tu método core) ---
  async actualizarEstado(idFactura: number, nuevoEstado: EstadoFactura) {
    this.logger.log('Actualizar estado', { idFactura, nuevoEstado });
    try {
      const updated = await this.prisma.factura.update({
        where: { idFactura },
        data: { estado: nuevoEstado },
      });
      this.logger.log('Estado actualizado con éxito', { idFactura });
      return updated;
    } catch (error: any) {
      this.logger.error('Error actualizando estado', error?.stack || error?.message || error);
      throw error;
    }
  }

  
}