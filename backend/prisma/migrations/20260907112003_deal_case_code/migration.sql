-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "caseCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Deal_caseCode_key" ON "Deal"("caseCode");
