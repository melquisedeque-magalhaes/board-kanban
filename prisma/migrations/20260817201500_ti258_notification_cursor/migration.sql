-- CreateTable
CREATE TABLE "NotificationCursor" (
  "recipientId" TEXT NOT NULL,
  "revision" BIGINT NOT NULL,
  CONSTRAINT "NotificationCursor_pkey" PRIMARY KEY ("recipientId")
);

-- Preserve the greatest revision already assigned by BIGSERIAL for each recipient.
INSERT INTO "NotificationCursor" ("recipientId", "revision")
SELECT "recipientId", MAX("sequence")
FROM "Notification"
GROUP BY "recipientId";

-- Future revisions are assigned transactionally by the trigger below.
ALTER TABLE "Notification" ALTER COLUMN "sequence" DROP DEFAULT;
DROP SEQUENCE IF EXISTS "Notification_sequence_seq";

-- AddForeignKey
ALTER TABLE "NotificationCursor"
ADD CONSTRAINT "NotificationCursor_recipientId_fkey"
FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Serialize revisions per recipient. The UPSERT locks the recipient cursor row
-- until the inserting transaction commits, so a later visible insert always has
-- a greater revision for that recipient.
CREATE FUNCTION "assign_notification_revision"()
RETURNS TRIGGER AS $$
DECLARE
  next_revision BIGINT;
BEGIN
  INSERT INTO "NotificationCursor" ("recipientId", "revision")
  VALUES (NEW."recipientId", 1)
  ON CONFLICT ("recipientId")
  DO UPDATE SET "revision" = "NotificationCursor"."revision" + 1
  RETURNING "revision" INTO next_revision;

  NEW."sequence" := next_revision;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Notification_assign_revision"
BEFORE INSERT ON "Notification"
FOR EACH ROW
EXECUTE FUNCTION "assign_notification_revision"();
