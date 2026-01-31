import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  UnauthorizedException,
  GatewayTimeoutException,
  BadGatewayException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as AdmZip from 'adm-zip';
import {
  SunatAuthResponse,
  SunatTicketResponse,
  SunatStatusResponse,
  SunatArchivoReporte,
  DownloadParams,
} from './sunat.interfaces';

@Injectable()
export class SunatService {
  private readonly logger = new Logger(SunatService.name);

  // URLs base de SUNAT
  private readonly AUTH_BASE_URL = 'https://api-seguridad.sunat.gob.pe/v1/clientessol';
  private readonly SIRE_BASE_URL = 'https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/libros';

  // Token en memoria (cache simple)
  private accessToken: string | null = null;
  private tokenExpiration: Date | null = null;

  // Configuración de polling
  private readonly POLLING_INTERVAL_MS = 3000; // 3 segundos
  private readonly POLLING_MAX_ATTEMPTS = 60; // Máximo ~3 minutos de espera

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  // ============================================
  // MÉTODO PRINCIPAL DE ORQUESTACIÓN
  // ============================================

  /**
   * Orquesta el flujo completo para obtener el reporte de facturación
   * @param periodo - Período tributario (ej: "202512")
   * @returns Contenido del archivo TXT descomprimido
   */
  async obtenerReporteFacturacion(periodo: string): Promise<string> {
    this.logger.log(`Iniciando flujo de obtención de reporte para periodo: ${periodo}`);

    try {
      // PASO 1: Autenticación
      const token = await this.getAccessToken();
      this.logger.log('Autenticación exitosa');

      // PASO 2: Solicitar exportación
      const ticketResponse = await this.requestExportTicket(token, periodo);
      this.logger.log(`Ticket obtenido: ${ticketResponse.numTicket}`);

      // PASO 3: Polling de estado
      const archivoReporte = await this.pollTicketStatus(
        token,
        ticketResponse.numTicket,
        periodo,
      );
      this.logger.log(`Archivo listo: ${archivoReporte.nomArchivoReporte}`);

      // PASO 4: Descargar ZIP
      const downloadParams: DownloadParams = {
        nomArchivoReporte: archivoReporte.nomArchivoReporte,
        codTipoArchivoReporte: '00',
        perTributario: periodo,
        codProceso: '10',
        numTicket: ticketResponse.numTicket,
      };
      const zipBuffer = await this.downloadZipFile(token, downloadParams);
      this.logger.log(`ZIP descargado: ${zipBuffer.length} bytes`);

      // PASO 5: Descomprimir y extraer TXT
      const contenido = this.extractTextFromZip(zipBuffer);
      this.logger.log(`Contenido extraído: ${contenido.length} caracteres`);

      return contenido;
    } catch (error) {
      this.logger.error('Error en flujo de obtención de reporte', error);
      throw error;
    }
  }

  // ============================================
  // PASO 1: AUTENTICACIÓN
  // ============================================

  /**
   * Obtiene el token de acceso OAuth2 de SUNAT
   * Implementa cache simple para evitar autenticaciones innecesarias
   */
  private async getAccessToken(): Promise<string> {
    // Verificar si el token actual es válido
    if (this.accessToken && this.tokenExpiration && new Date() < this.tokenExpiration) {
      this.logger.debug('Usando token en cache');
      return this.accessToken;
    }

    const clientId = this.configService.get<string>('SUNAT_CLIENT_ID');
    const clientSecret = this.configService.get<string>('SUNAT_CLIENT_SECRET');
    const ruc = this.configService.get<string>('SUNAT_RUC');
    const usuarioSol = this.configService.get<string>('SUNAT_USUARIO_SOL');
    const claveSol = this.configService.get<string>('SUNAT_CLAVE_SOL');

    // Validar configuración
    if (!clientId || !clientSecret || !ruc || !usuarioSol || !claveSol) {
      throw new HttpException(
        'Configuración de SUNAT incompleta. Verificar variables de entorno.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // URL con client_id en el path
    const url = `${this.AUTH_BASE_URL}/${clientId}/oauth2/token/`;

    // Body en formato x-www-form-urlencoded
    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('scope', 'https://api-sire.sunat.gob.pe');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('username', `${ruc}${usuarioSol}`);
    params.append('password', claveSol);

    try {
      const response = await firstValueFrom(
        this.httpService.post<SunatAuthResponse>(url, params.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      );

      const { access_token, expires_in } = response.data;

      // Almacenar token y calcular expiración (con margen de 60 segundos)
      this.accessToken = access_token;
      this.tokenExpiration = new Date(Date.now() + (expires_in - 60) * 1000);

      return access_token;
    } catch (error) {
      const errorMessage = error.response?.data?.error_description || error.message;
      this.logger.error('Error de autenticación SUNAT', errorMessage);
      throw new UnauthorizedException(`Error de autenticación SUNAT: ${errorMessage}`);
    }
  }

  // ============================================
  // PASO 2: SOLICITAR EXPORTACIÓN
  // ============================================

  /**
   * Solicita la exportación de comprobantes para un período
   * @returns Respuesta con numTicket para seguimiento
   */
  private async requestExportTicket(
    token: string,
    periodo: string,
  ): Promise<SunatTicketResponse> {
    const url = `${this.SIRE_BASE_URL}/rce/propuesta/web/propuesta/${periodo}/exportacioncomprobantepropuesta`;

    try {
      const response = await firstValueFrom(
        this.httpService.get<SunatTicketResponse>(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
          params: {
            codTipoArchivo: '0', // TXT
            codOrigenEnvio: '2',
          },
        }),
      );

      if (!response.data.numTicket) {
        throw new Error('SUNAT no devolvió numTicket');
      }

      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.msg || error.message;
      this.logger.error('Error al solicitar ticket', errorMessage);
      throw new BadGatewayException(
        `Error al solicitar exportación a SUNAT: ${errorMessage}`,
      );
    }
  }

  // ============================================
  // PASO 3: POLLING DE ESTADO
  // ============================================

  /**
   * Realiza polling hasta que el proceso esté terminado (codEstado === "1")
   * @returns Información del archivo de reporte
   */
  private async pollTicketStatus(
    token: string,
    numTicket: string,
    periodo: string,
  ): Promise<SunatArchivoReporte> {
    const url = `${this.SIRE_BASE_URL}/rvierce/gestionprocesosmasivos/web/masivo/consultaestadotickets`;

    for (let attempt = 1; attempt <= this.POLLING_MAX_ATTEMPTS; attempt++) {
      this.logger.debug(`Polling intento ${attempt}/${this.POLLING_MAX_ATTEMPTS}`);

      try {
        const response = await firstValueFrom(
          this.httpService.get<SunatStatusResponse>(url, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
            params: {
              perIni: periodo,
              perFin: periodo,
              page: '1',
              perPage: '20',
              numTicket: numTicket,
            },
          }),
        );

        const registros = response.data.registros;
        if (!registros || registros.length === 0) {
          throw new Error('No se encontraron registros para el ticket');
        }

        const registro = registros[0];
        const archivoReporte = registro.archivoReporte?.[0];

        if (!archivoReporte) {
          throw new Error('No hay archivo de reporte disponible');
        }

        // Verificar estado
        if (archivoReporte.codEstado === '1') {
          this.logger.log(`Proceso terminado en intento ${attempt}`);
          return archivoReporte;
        }

        // Estado no es "1", esperar y reintentar
        this.logger.debug(`Estado actual: ${archivoReporte.codEstado}, esperando...`);
        await this.delay(this.POLLING_INTERVAL_MS);
      } catch (error) {
        if (error.response?.status === 404) {
          // Ticket aún no visible, esperar
          await this.delay(this.POLLING_INTERVAL_MS);
          continue;
        }
        throw error;
      }
    }

    // Timeout alcanzado
    throw new GatewayTimeoutException(
      `Timeout esperando respuesta de SUNAT. El proceso no se completó en el tiempo límite.`,
    );
  }

  // ============================================
  // PASO 4: DESCARGAR ZIP
  // ============================================

  /**
   * Descarga el archivo ZIP binario
   * @returns Buffer del archivo ZIP
   */
  private async downloadZipFile(
    token: string,
    params: DownloadParams,
  ): Promise<Buffer> {
    const url = `${this.SIRE_BASE_URL}/rvierce/gestionprocesosmasivos/web/masivo/archivoreporte`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
          params: {
            nomArchivoReporte: params.nomArchivoReporte,
            codTipoArchivoReporte: params.codTipoArchivoReporte,
            perTributario: params.perTributario,
            codProceso: params.codProceso,
            numTicket: params.numTicket,
          },
          responseType: 'arraybuffer',
        }),
      );

      return Buffer.from(response.data);
    } catch (error) {
      const errorMessage = error.response?.data?.msg || error.message;
      this.logger.error('Error al descargar archivo', errorMessage);
      throw new BadGatewayException(
        `Error al descargar archivo de SUNAT: ${errorMessage}`,
      );
    }
  }

  // ============================================
  // PASO 5: DESCOMPRESIÓN
  // ============================================

  /**
   * Extrae el contenido del archivo TXT dentro del ZIP
   * @param zipBuffer - Buffer del archivo ZIP
   * @returns Contenido del archivo TXT como string UTF-8
   */
  private extractTextFromZip(zipBuffer: Buffer): string {
    try {
      const zip = new AdmZip(zipBuffer);
      const zipEntries = zip.getEntries();

      // Buscar archivo .txt dentro del ZIP
      const txtEntry = zipEntries.find((entry) =>
        entry.entryName.toLowerCase().endsWith('.txt'),
      );

      if (!txtEntry) {
        throw new Error('No se encontró archivo TXT dentro del ZIP');
      }

      this.logger.debug(`Extrayendo archivo: ${txtEntry.entryName}`);

      // Leer contenido como UTF-8
      const content = zip.readAsText(txtEntry, 'utf-8');

      return content;
    } catch (error) {
      this.logger.error('Error al descomprimir archivo', error.message);
      throw new HttpException(
        `Error al procesar archivo ZIP: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================
  // UTILIDADES
  // ============================================

  /**
   * Promesa de espera
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
