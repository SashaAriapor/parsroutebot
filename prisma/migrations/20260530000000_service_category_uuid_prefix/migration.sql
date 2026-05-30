ALTER TABLE "ServiceCategory" ADD COLUMN "uuidPrefix" TEXT NOT NULL DEFAULT '1';
UPDATE "ServiceCategory" SET "uuidPrefix" = '2' WHERE id = 1;
UPDATE "ServiceCategory" SET "serverId" = '1' WHERE id = 1;
