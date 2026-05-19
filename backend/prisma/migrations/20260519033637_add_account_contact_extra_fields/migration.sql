-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "parentCompany" TEXT,
ADD COLUMN     "taxCode" TEXT;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "birthday" TIMESTAMP(3),
ADD COLUMN     "department" TEXT,
ADD COLUMN     "description" TEXT;
