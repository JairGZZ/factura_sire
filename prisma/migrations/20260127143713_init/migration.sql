-- CreateEnum
CREATE TYPE "EstadoFactura" AS ENUM ('CONSULTADO', 'CON_DETALLE', 'REGISTRADO', 'CONTABILIZADO');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" TEXT NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredencialSOL" (
    "ruc" TEXT NOT NULL,
    "usuarioSOL" TEXT NOT NULL,
    "claveSOL" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "usuarioId" INTEGER NOT NULL,

    CONSTRAINT "CredencialSOL_pkey" PRIMARY KEY ("ruc")
);

-- CreateTable
CREATE TABLE "Proveedor" (
    "rucProveedor" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("rucProveedor")
);

-- CreateTable
CREATE TABLE "Factura" (
    "idFactura" SERIAL NOT NULL,
    "numeroComprobante" TEXT NOT NULL,
    "fechaEmision" TIMESTAMP(3) NOT NULL,
    "total" DECIMAL(65,30) NOT NULL,
    "estado" "EstadoFactura" NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "proveedorRuc" TEXT NOT NULL,

    CONSTRAINT "Factura_pkey" PRIMARY KEY ("idFactura")
);

-- CreateTable
CREATE TABLE "ComprobanteElectronico" (
    "idComprobante" SERIAL NOT NULL,
    "xml" TEXT NOT NULL,
    "cdr" TEXT NOT NULL,
    "fechaRecepcion" TIMESTAMP(3) NOT NULL,
    "estadoSunat" TEXT NOT NULL,
    "facturaId" INTEGER NOT NULL,

    CONSTRAINT "ComprobanteElectronico_pkey" PRIMARY KEY ("idComprobante")
);

-- CreateIndex
CREATE UNIQUE INDEX "CredencialSOL_usuarioId_key" ON "CredencialSOL"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "ComprobanteElectronico_facturaId_key" ON "ComprobanteElectronico"("facturaId");

-- AddForeignKey
ALTER TABLE "CredencialSOL" ADD CONSTRAINT "CredencialSOL_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_proveedorRuc_fkey" FOREIGN KEY ("proveedorRuc") REFERENCES "Proveedor"("rucProveedor") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComprobanteElectronico" ADD CONSTRAINT "ComprobanteElectronico_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("idFactura") ON DELETE RESTRICT ON UPDATE CASCADE;
