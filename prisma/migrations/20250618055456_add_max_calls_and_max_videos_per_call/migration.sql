-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "maxCalls" INTEGER,
ADD COLUMN     "maxVideosPerCall" INTEGER DEFAULT 1;
