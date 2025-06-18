/*
  Warnings:

  - You are about to drop the column `isCustom` on the `Transcript` table. All the data in the column will be lost.
  - You are about to drop the column `lengthSeconds` on the `Video` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[id]` on the table `Video` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `category` to the `Video` table without a default value. This is not possible if the table is not empty.
  - Added the required column `duration` to the `Video` table without a default value. This is not possible if the table is not empty.
  - Added the required column `likes` to the `Video` table without a default value. This is not possible if the table is not empty.
  - Added the required column `views` to the `Video` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Transcript" DROP COLUMN "isCustom";

-- AlterTable
ALTER TABLE "Video" DROP COLUMN "lengthSeconds",
ADD COLUMN     "category" TEXT NOT NULL,
ADD COLUMN     "duration" INTEGER NOT NULL,
ADD COLUMN     "likes" INTEGER NOT NULL,
ADD COLUMN     "tags" TEXT[],
ADD COLUMN     "views" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Video_id_key" ON "Video"("id");
