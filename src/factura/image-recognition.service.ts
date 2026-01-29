import OpenAI from "openai";

export class ImageRecognitionService {
  private openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  async analizarImagen(fileBuffer: Buffer, mimeType: string) {
    try {
      // 1. Convertir a Base64
      const base64Image = fileBuffer.toString('base64');

      // 2. Llamada a GPT-4o-mini (El más estable para visión)
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extrae los datos de la imagen y responde estrictamente en JSON con los campos: ruc, numero, fecha, monto (number), razonSocial. No incluyas texto extra. Verifica bien el tipo de textura de los números."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                  detail: "low" // 'low' ayuda a que no falle por tamaño de imagen y gasta menos tokens
                },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0, // Máxima precisión
      });

      const content = response.choices[0].message.content;
      return JSON.parse(content || "{}");

    } catch (error: any) {
      // LOG CRÍTICO: Aquí veremos exactamente por qué falla
      console.error("--- ERROR EN OPENAI ---");
      console.error("Status:", error.status);
      console.error("Message:", error.message);
      
      if (error.status === 413) {
        throw new Error("La imagen es muy pesada. Intenta comprimirla o bajarle la resolución.");
      }
      
      throw new Error(`Error en el reconocimiento: ${error.message}`);
    }
  }
}