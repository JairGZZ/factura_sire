import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EstadoFactura } from '@prisma/client';
import { SireService } from '../sire/sire.service'; // Apunta a la carpeta sire
@Injectable()
export class FacturasService {
  constructor(
    private prisma: PrismaService,
    private sireService: SireService,
  ) {}

  // --- REGISTRO FACTURA ---
async registrarFactura(data: any) {
  // Aseguramos que el proveedor exista
  await this.prisma.proveedor.upsert({
    where: { rucProveedor: data.proveedorRuc },
    update: {}, // Si existe no hacemos nada
    create: { 
      rucProveedor: data.proveedorRuc,
      razonSocial: "Proveedor Genérico" // O el dato que tengas
    }
  });

  // Ahora sí creamos la factura
  return this.prisma.factura.create({
    data: {
      numeroComprobante: data.numero,
      fechaEmision: new Date(data.fecha),
      total: data.total,
      estado: EstadoFactura.CONSULTADO,
      usuarioId: data.usuarioId,
      proveedorRuc: data.proveedorRuc,
    },
  });
}

  // --- REGISTRO AUTOMÁTICO DESDE SIRE (La recomendación mejorada) ---
  async sincronizarFacturasSire(token: string, periodo: string, usuarioId: number) {
    // 1. Llamamos al servicio que configuramos antes
    const data = await this.sireService.consultarFacturas(token, periodo);

    // 2. Recorremos las facturas que envió SUNAT
    const resultados = [];
    for (const item of data) {
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
    return this.prisma.factura.update({
      where: { idFactura },
      data: { estado: nuevoEstado },
    });
  }

  
}