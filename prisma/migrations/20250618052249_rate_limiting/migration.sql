/*
  Warnings:

  - You are about to drop the column `dailyLimit` on the `ApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `lastRequestDate` on the `ApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `monthlyLimit` on the `ApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `planType` on the `ApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `requestsThisMonth` on the `ApiKey` table. All the data in the column will be lost.
  - You are about to drop the column `requestsToday` on the `ApiKey` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ApiKey" DROP COLUMN "dailyLimit",
DROP COLUMN "lastRequestDate",
DROP COLUMN "monthlyLimit",
DROP COLUMN "planType",
DROP COLUMN "requestsThisMonth",
DROP COLUMN "requestsToday";
