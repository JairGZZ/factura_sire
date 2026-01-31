/**
 * SUNAT API Response Interfaces
 * Tipado fuerte para todas las respuestas de las APIs de SUNAT
 */

// ============================================
// PASO 1: Autenticación OAuth2
// ============================================

export interface SunatAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

// ============================================
// PASO 2: Solicitar Exportación (Ticket)
// ============================================

export interface SunatTicketResponse {
  numTicket: string;
  codCar?: string;
  fecProceso?: string;
}

// ============================================
// PASO 3: Consultar Estado del Ticket
// ============================================

export interface SunatStatusResponse {
  perIni: string;
  perFin: string;
  numPagina: number;
  numRegistro: number;
  registros: SunatTicketRegistro[];
}

export interface SunatTicketRegistro {
  numTicket: string;
  perTributario: string;
  codProceso: string;
  desProceso?: string;
  fecInicio?: string;
  fecFin?: string;
  archivoReporte: SunatArchivoReporte[];
}

export interface SunatArchivoReporte {
  nomArchivoReporte: string;
  nomArchivoContenido: string;
  codEstado: string; // "0" = procesando, "1" = terminado
  desEstado?: string;
  numRegistros?: number;
}

// ============================================
// PASO 4: Parámetros de descarga
// ============================================

export interface DownloadParams {
  nomArchivoReporte: string;
  codTipoArchivoReporte: string;
  perTributario: string;
  codProceso: string;
  numTicket: string;
}

// ============================================
// Errores de SUNAT
// ============================================

export interface SunatErrorResponse {
  cod: string;
  msg: string;
}

// ============================================
// Configuración del módulo
// ============================================

export interface SunatConfig {
  clientId: string;
  clientSecret: string;
  ruc: string;
  usuarioSol: string;
  claveSol: string;
}
