
import { Injectable, HttpException, HttpStatus, BadRequestException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { URLSearchParams } from 'url';
import * as zlib from 'zlib';

@Injectable()
export class SireService {
  private readonly logger = new Logger(SireService.name);
  // URLs base según manuales de SUNAT
  private readonly AUTH_URL = 'https://api-seguridad.sunat.gob.pe/v1/clientessol/client_id/oauth2/token'; //Parámetros[header] Descripción:Content-type: tipo de contenido a enviarValores:Content-type: application/x-www-form-urlencoded (opcional)Método: POST
  private readonly SIRE_URL_TICKET = 'https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros/rce/propuesta/web/propuesta/{perTributario}/exportacioncomprobantepropuesta?codTipoArchivo={codTipoArchivo}&codOrigenEnvio={codOrigenEnvio}'; //Parámetros[header] Descripción:Content-type: tipo de contenido a enviarValores:Content-type: application/x-www-form-urlencodedParámetros valorContent-Type application/jsonAccept application/jsonAuthorization Bearer token obtenido de la autenticaciónMétodo: GET
  private readonly SIRE_URL_ESTADO = 'https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros/rvierce/gestionprocesosmasivos/web/masivo/consultaestadotickets?perIni={perIni}&perFin={perFin}&page={page}&perPage={perPage}&numTicket={numTicket}'; //Parámetros[header] Descripción:Content-type: tipo de contenido a enviarValores:Parámetros valorContent-Type application/jsonAccept application/jsonAuthorization Bearer token obtenido de la autenticaciónMétodo: GET
  private readonly SIRE_URL_DESC = 'https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros/rvierce/gestionprocesosmasivos/web/masivo/archivoreporte?nomArchivoReporte={nomArchivoReporte}&codTipoArchivoReporte={codTipoArchivoReporte}&perTributario={perTributario}&codProceso={codProceso}&numTicket={numTicket}&codLibro={codLibro}';

  constructor(private readonly httpService: HttpService) {}

  // 1. Obtener Token (Tu método es esencial)

async obtenerToken(ruc: string, usuarioSol: string, claveSol: string) {
  // 1. Limpiar espacios accidentales
  const clientId = process.env.SUNAT_CLIENT_ID?.trim();
  const clientSecret = process.env.SUNAT_CLIENT_SECRET?.trim();
  
  // 2. SUNAT espera x-www-form-urlencoded
  const params = new URLSearchParams();
  params.append('grant_type', 'password');
  params.append('scope', 'https://api-sire.sunat.gob.pe');
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('username', `${ruc.trim()}${usuarioSol.trim()}`);
  params.append('password', claveSol.trim());

  try {
    const response = await firstValueFrom(
      this.httpService.post(this.AUTH_URL, params.toString(), {
        headers: {
          // Es fundamental que el header sea este:
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }),
    );
    this.logger.log('Token obtenido de SUNAT', { ruc, tokenPresent: !!response.data?.access_token });
    return response.data.access_token;
  } catch (error) {
    // Si falla, imprimimos el error real de SUNAT en la terminal de VS Code
    this.logger.error('Error detallado de SUNAT', error.response?.data || error?.message || error);
    throw new BadRequestException(
      error.response?.data?.error_description || 'parametros invalidos'
    );
  }
}

  async solicitarTicket(token: string, periodo: string) {
    // Reemplazamos el placeholder del periodo en la URL
    const url = this.SIRE_URL_TICKET.replace('{perTributario}', periodo);

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          // Parámetros que pide el manual (0: TXT, 1: CSV)
          params: { codTipoArchivo: '0', codOrigenEnvio: '2' }
        })
      );
  this.logger.log('Ticket solicitado a SUNAT', { periodo: periodo, numTicket: response.data?.numTicket });
  return response.data; // Devuelve numTicket y codCar
    } catch (error) {
  this.logger.error('Error al solicitar ticket', error.response?.data || error?.message || error);
  throw new HttpException('No se pudo generar el ticket en SUNAT', HttpStatus.BAD_GATEWAY);
    }
  }

  async consultarEstadoTicket(token: string, numTicket: string, periodo: string) {
    const url = this.SIRE_URL_ESTADO
      .replace('{perIni}', periodo)
      .replace('{perFin}', periodo)
      .replace('{numTicket}', numTicket)
      .replace('{page}', '1')
      .replace('{perPage}', '20');

    const response = await firstValueFrom(
      this.httpService.get(url, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'Content-Type': 'application/json' }
      })
    );
    
    // Si el estado es "TERMINADO", te devolverá el nombre del archivo (archivoReporte)
  this.logger.log('Estado ticket consultado', { numTicket, page: 1 });
    return response.data; 
  }


async descargarYDescomprimirPropuesta(token: string, estadoResponse: any) {
  // 1. Extraemos el primer registro (asumiendo que consultaste un solo ticket)
  const registro = estadoResponse.registros[0];
  const reporte = registro.archivoReporte[0];

  // 2. Construimos la URL con el nuevo "type of texture" de parámetros
  const url = this.SIRE_URL_DESC
    .replace('{nomArchivoReporte}', reporte.nomArchivoReporte)
    .replace('{codTipoArchivoReporte}', '1') // 1 para Propuesta RCE
    .replace('{perTributario}', registro.perTributario)
    .replace('{codProceso}', registro.codProceso)
    .replace('{numTicket}', registro.numTicket)
    .replace('{codLibro}', '14'); // Código para RCE

  try {
    const response = await firstValueFrom(
      this.httpService.get(url, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'Content-Type': 'application/json' }
      })
    );

    // 3. Procesamiento de Base64 y Descompresión
    const base64Zip = response.data.archivo;
    const zipBuffer = Buffer.from(base64Zip, 'base64');
    const decompressed = zlib.unzipSync(zipBuffer); // O gunzipSync si es GZIP

  this.logger.log('Archivo de propuesta descargado y descomprimido', { length: decompressed.length });
    return decompressed.toString('utf-8');
  } catch (error) {
  this.logger.error('Error detallado en descarga', error.response?.data || error?.message || error);
  throw new Error("No se pudo descargar el archivo de la propuesta.");
  }
}


  // 3. Obtener detalle XML/CDR (Lo que te faltaba y te recomendaron)
  async obtenerXmlCdr(token: string, ruc: string, tipo: string, serie: string, numero: string) {
    const url = `https://api.sunat.gob.pe/v1/contribuyente/see/comprobantes/${ruc}-${tipo}-${serie}-${numero}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: { Authorization: `Bearer ${token}` }
        })
      );
      return response.data; // Retorna el XML base64 o link
    } catch (error) {
      throw new HttpException('No se pudo recuperar el XML/CDR', HttpStatus.NOT_FOUND);
    }
  }
}
