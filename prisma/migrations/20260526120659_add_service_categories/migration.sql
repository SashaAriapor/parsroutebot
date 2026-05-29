-- DropForeignKey
ALTER TABLE "VpnConfig" DROP CONSTRAINT "VpnConfig_serverId_fkey";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "categoryId" INTEGER;

-- AlterTable
ALTER TABLE "VpnConfig" ADD COLUMN     "serverLabel" TEXT,
ALTER COLUMN "serverId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ServiceCategory" (
    "id" SERIAL NOT NULL,
    "nameFa" TEXT NOT NULL,
    "pricePerGb" BIGINT NOT NULL,
    "serverId" TEXT NOT NULL,
    "serverName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "VpnConfig" ADD CONSTRAINT "VpnConfig_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
