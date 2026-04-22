-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" TEXT,
    "website" TEXT,
    "strengths" TEXT,
    "weaknesses" TEXT,
    "pricing" TEXT,
    "notes" TEXT,
    "swotAnalysis" TEXT,
    "swotAt" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorIntel" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT,
    "impact" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorIntel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSizing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "vertical" TEXT,
    "inputs" JSONB NOT NULL,
    "tam" DOUBLE PRECISION NOT NULL,
    "sam" DOUBLE PRECISION NOT NULL,
    "som" DOUBLE PRECISION NOT NULL,
    "analysis" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketSizing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Competitor_ownerId_createdAt_idx" ON "Competitor"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "CompetitorIntel_competitorId_createdAt_idx" ON "CompetitorIntel"("competitorId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketSizing_userId_createdAt_idx" ON "MarketSizing"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CompetitorIntel" ADD CONSTRAINT "CompetitorIntel_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
