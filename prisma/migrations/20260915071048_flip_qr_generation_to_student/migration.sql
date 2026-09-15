/*
  Warnings:

  - You are about to drop the column `consumed_by_student` on the `security_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `created_by` on the `security_sessions` table. All the data in the column will be lost.
  - Added the required column `created_by_student` to the `security_sessions` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "security_sessions" DROP CONSTRAINT "security_sessions_consumed_by_student_fkey";

-- DropForeignKey
ALTER TABLE "security_sessions" DROP CONSTRAINT "security_sessions_created_by_fkey";

-- DropForeignKey
ALTER TABLE "security_sessions" DROP CONSTRAINT "security_sessions_device_id_fkey";

-- DropForeignKey
ALTER TABLE "security_sessions" DROP CONSTRAINT "security_sessions_gate_id_fkey";

-- AlterTable
ALTER TABLE "security_sessions" DROP COLUMN "consumed_by_student",
DROP COLUMN "created_by",
ADD COLUMN     "created_by_student" TEXT NOT NULL,
ADD COLUMN     "scanned_by" TEXT,
ALTER COLUMN "gate_id" DROP NOT NULL,
ALTER COLUMN "device_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "security_sessions_created_by_student_idx" ON "security_sessions"("created_by_student");

-- AddForeignKey
ALTER TABLE "security_sessions" ADD CONSTRAINT "security_sessions_created_by_student_fkey" FOREIGN KEY ("created_by_student") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_sessions" ADD CONSTRAINT "security_sessions_gate_id_fkey" FOREIGN KEY ("gate_id") REFERENCES "gates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_sessions" ADD CONSTRAINT "security_sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_sessions" ADD CONSTRAINT "security_sessions_scanned_by_fkey" FOREIGN KEY ("scanned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
