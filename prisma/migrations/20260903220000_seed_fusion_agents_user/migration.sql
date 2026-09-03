INSERT INTO "User" ("id", "name")
SELECT 'cmfusionagents0000000000000001', 'fusion-agents'
WHERE NOT EXISTS (
  SELECT 1 FROM "User" WHERE "name" = 'fusion-agents'
);
