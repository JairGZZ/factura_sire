import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import * as tesseract from "node-tesseract-ocr";
import { GoogleGenerativeAI } from "@google/generative-ai";

@Injectable()
export class ImageRecognitionService {
  // Inicializamos Gemini con la API Key de tu .env
  private genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  private readonly logger = new Logger(ImageRecognitionService.name);

  async analizarImagen(fileBuffer: Buffer) {
    // 1. Configuración de Tesseract
    // IMPORTANTE: Debes tener instalado Tesseract en tu PC/Servidor
    const config = {
      lang: "spa", 
      oem: 1,
      psm: 3,
    };

    try {
  this.logger.log('Iniciando OCR Local con Tesseract');
      
      // 2. Extraer texto plano (Aquí es donde daba el error EPIPE si no estaba instalado)
      const textoExtraido = await tesseract.recognize(fileBuffer, config);
      
      if (!textoExtraido || textoExtraido.trim().length === 0) {
        this.logger.warn('Tesseract no extrajo texto');
        throw new Error("Tesseract no pudo extraer ningún texto de la imagen.");
      }

      this.logger.debug('Texto bruto detectado', { length: textoExtraido.length });
      this.logger.verbose(textoExtraido);

      // 3. Configurar el modelo de IA (Usamos solo texto para evitar el error 404 de visión)
      const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const prompt = `
        Eres un experto en facturación peruana. 
        A continuación te entrego un texto extraído mediante OCR de una factura. 
        Tu tarea es organizar este texto desordenado y devolver estrictamente un objeto JSON.

        Campos requeridos:
        - ruc (solo los 11 dígitos)
        - numero (serie y correlativo)
        - fecha (formato YYYY-MM-DD)
        - monto (número puro, usa punto decimal)
        - razonSocial (nombre de la empresa)

        Texto extraído:
        "${textoExtraido}"
      `;

  // 4. Llamada a Gemini (Modo Texto)
  this.logger.log('Llamando a Gemini para estructurar JSON');
  const result = await model.generateContent(prompt);
  const response = await result.response;
  let rawText = response.text();
      
      // Limpiamos posibles bloques de código Markdown
      const cleanJson = rawText.replace(/```json|```/g, "").trim();
      
      return JSON.parse(cleanJson);

    } catch (error: any) {
  this.logger.error('Fallo en flujo híbrido de imagen', error?.stack || error?.message || error);

      // Si el error es EPIPE o ENOENT, es que falta Tesseract en el sistema
      if (error.message.includes("ENOENT") || error.message.includes("EPIPE")) {
        throw new InternalServerErrorException(
          "Tesseract OCR no está instalado o no se encuentra en el PATH del sistema."
        );
      }

      throw new InternalServerErrorException("Error al procesar la imagen: " + error.message);
    }
  }
}