-- Flag p/ não sobrescrever nome/avatar editados no board com os dados do Clerk.
ALTER TABLE "User" ADD COLUMN "profileCustomized" BOOLEAN NOT NULL DEFAULT false;
