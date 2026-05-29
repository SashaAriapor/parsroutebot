-- Prefix existing VpnConfig.uuid values with their panel identifier so that
-- client IDs from different PasarGuard panels never collide.
--
-- Server-based configs: prefix with the DB Server.id stored in "serverId".
UPDATE "VpnConfig"
SET uuid = CONCAT("serverId"::text, '_', uuid)
WHERE "serverId" IS NOT NULL
  AND uuid NOT LIKE '%\_%' ESCAPE '\';

-- Category-based configs (serverId IS NULL): derive the panel group ID from
-- the linked Order → ServiceCategory."serverId" string.
UPDATE "VpnConfig" vc
SET uuid = CONCAT(sc."serverId", '_', vc.uuid)
FROM "Order" o
JOIN "ServiceCategory" sc ON sc.id = o."categoryId"
WHERE o."configId" = vc.id
  AND vc."serverId" IS NULL
  AND vc.uuid NOT LIKE '%\_%' ESCAPE '\';
