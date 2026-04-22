-- AlterTable
ALTER TABLE "EmailDraft" ADD COLUMN     "sendError" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "sentTo" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'draft';
