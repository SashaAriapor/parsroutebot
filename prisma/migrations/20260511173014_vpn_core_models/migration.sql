-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('WALLET', 'TON');

-- CreateEnum
CREATE TYPE "ConfigStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DISABLED', 'DELETED');

-- CreateEnum
CREATE TYPE "WalletTxType" AS ENUM ('TOPUP_TON', 'TOPUP_ADMIN', 'PURCHASE', 'REFUND', 'REFERRAL_COMMISSION', 'ADMIN_DEDUCT');

-- CreateEnum
CREATE TYPE "TonPaymentStatus" AS ENUM ('DETECTED', 'MATCHED', 'ORPHANED');

-- CreateEnum
CREATE TYPE "AdminActionType" AS ENUM ('WALLET_ADD', 'WALLET_DEDUCT', 'GIFT_SERVICE', 'EXTEND_SERVICE', 'ADD_TRAFFIC', 'BAN_USER', 'UNBAN_USER', 'BROADCAST', 'CREATE_DISCOUNT', 'REPLY_TICKET');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "totalPurchases" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalSpent" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Plan" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "trafficGB" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "priceToman" BIGINT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Server" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "flag" TEXT,
    "panelUrl" TEXT,
    "panelUsername" TEXT,
    "panelPassword" TEXT,
    "inboundId" INTEGER NOT NULL,
    "subDomain" TEXT NOT NULL,
    "subPort" INTEGER NOT NULL DEFAULT 2096,
    "subPath" TEXT NOT NULL DEFAULT '/sub/',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VpnConfig" (
    "id" SERIAL NOT NULL,
    "userId" BIGINT NOT NULL,
    "serverId" INTEGER NOT NULL,
    "panelClientId" INTEGER,
    "email" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "subId" TEXT NOT NULL,
    "totalGB" INTEGER NOT NULL,
    "expiryAt" TIMESTAMP(3),
    "uploadBytes" BIGINT NOT NULL DEFAULT 0,
    "downloadBytes" BIGINT NOT NULL DEFAULT 0,
    "lastSyncAt" TIMESTAMP(3),
    "notified80Pct" BOOLEAN NOT NULL DEFAULT false,
    "notified95Pct" BOOLEAN NOT NULL DEFAULT false,
    "notifiedExpiry3d" BOOLEAN NOT NULL DEFAULT false,
    "notifiedExpiry1d" BOOLEAN NOT NULL DEFAULT false,
    "status" "ConfigStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VpnConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,
    "planId" INTEGER NOT NULL,
    "serverId" INTEGER,
    "priceToman" BIGINT NOT NULL,
    "discountCode" TEXT,
    "discountAmount" BIGINT NOT NULL DEFAULT 0,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "tonAmountNano" BIGINT,
    "tonMemo" TEXT,
    "tonRateSnapshot" DECIMAL(20,8),
    "rateValidUntil" TIMESTAMP(3),
    "configId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "userId" BIGINT NOT NULL,
    "type" "WalletTxType" NOT NULL,
    "amountToman" BIGINT NOT NULL,
    "balanceAfter" BIGINT NOT NULL,
    "description" TEXT,
    "orderId" TEXT,
    "tonPaymentId" TEXT,
    "adminId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TonPayment" (
    "id" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "amountNano" BIGINT NOT NULL,
    "memo" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "status" "TonPaymentStatus" NOT NULL DEFAULT 'DETECTED',
    "matchedOrderId" TEXT,
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TonPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" SERIAL NOT NULL,
    "referrerId" BIGINT NOT NULL,
    "refereeId" BIGINT NOT NULL,
    "totalCommission" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountCode" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "percentOff" INTEGER NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "onlyForUserId" BIGINT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" BIGINT,

    CONSTRAINT "DiscountCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAction" (
    "id" BIGSERIAL NOT NULL,
    "adminId" BIGINT NOT NULL,
    "type" "AdminActionType" NOT NULL,
    "targetUserId" BIGINT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Plan_isActive_sortOrder_idx" ON "Plan"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Server_name_key" ON "Server"("name");

-- CreateIndex
CREATE INDEX "Server_isActive_sortOrder_idx" ON "Server"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "VpnConfig_email_key" ON "VpnConfig"("email");

-- CreateIndex
CREATE UNIQUE INDEX "VpnConfig_uuid_key" ON "VpnConfig"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "VpnConfig_subId_key" ON "VpnConfig"("subId");

-- CreateIndex
CREATE INDEX "VpnConfig_userId_status_idx" ON "VpnConfig"("userId", "status");

-- CreateIndex
CREATE INDEX "VpnConfig_status_expiryAt_idx" ON "VpnConfig"("status", "expiryAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tonMemo_key" ON "Order"("tonMemo");

-- CreateIndex
CREATE UNIQUE INDEX "Order_configId_key" ON "Order"("configId");

-- CreateIndex
CREATE INDEX "Order_userId_status_idx" ON "Order"("userId", "status");

-- CreateIndex
CREATE INDEX "Order_status_rateValidUntil_idx" ON "Order"("status", "rateValidUntil");

-- CreateIndex
CREATE INDEX "Order_tonMemo_idx" ON "Order"("tonMemo");

-- CreateIndex
CREATE INDEX "WalletTransaction_userId_createdAt_idx" ON "WalletTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_type_createdAt_idx" ON "WalletTransaction"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TonPayment_txHash_key" ON "TonPayment"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "TonPayment_matchedOrderId_key" ON "TonPayment"("matchedOrderId");

-- CreateIndex
CREATE INDEX "TonPayment_status_receivedAt_idx" ON "TonPayment"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "TonPayment_memo_idx" ON "TonPayment"("memo");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_refereeId_key" ON "Referral"("refereeId");

-- CreateIndex
CREATE INDEX "Referral_referrerId_idx" ON "Referral"("referrerId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCode_code_key" ON "DiscountCode"("code");

-- CreateIndex
CREATE INDEX "DiscountCode_code_isActive_idx" ON "DiscountCode"("code", "isActive");

-- CreateIndex
CREATE INDEX "AdminAction_adminId_createdAt_idx" ON "AdminAction"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAction_targetUserId_createdAt_idx" ON "AdminAction"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAction_type_createdAt_idx" ON "AdminAction"("type", "createdAt");

-- CreateIndex
CREATE INDEX "User_referralCode_idx" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- AddForeignKey
ALTER TABLE "VpnConfig" ADD CONSTRAINT "VpnConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VpnConfig" ADD CONSTRAINT "VpnConfig_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_configId_fkey" FOREIGN KEY ("configId") REFERENCES "VpnConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TonPayment" ADD CONSTRAINT "TonPayment_matchedOrderId_fkey" FOREIGN KEY ("matchedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
