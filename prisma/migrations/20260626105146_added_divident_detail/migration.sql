-- CreateTable
CREATE TABLE "DividendDetail" (
    "id" TEXT NOT NULL,
    "grossAmount" DOUBLE PRECISION,
    "netAmount" DOUBLE PRECISION,
    "withholdingTax" DOUBLE PRECISION,
    "withholdingPct" DOUBLE PRECISION,
    "orderId" TEXT NOT NULL,

    CONSTRAINT "DividendDetail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DividendDetail_orderId_key" ON "DividendDetail"("orderId");

-- AddForeignKey
ALTER TABLE "DividendDetail" ADD CONSTRAINT "DividendDetail_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
