/*
  Warnings:

  - A unique constraint covering the columns `[videoId]` on the table `Transcript` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Transcript_videoId_key" ON "Transcript"("videoId");
