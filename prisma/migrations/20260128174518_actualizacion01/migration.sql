/*
  Warnings:

  - A unique constraint covering the columns `[numeroComprobante]` on the table `Factura` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Factura_numeroComprobante_key" ON "Factura"("numeroComprobante");
