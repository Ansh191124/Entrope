-- DropForeignKey
ALTER TABLE "access_events" DROP CONSTRAINT "access_events_device_id_fkey";

-- DropForeignKey
ALTER TABLE "access_events" DROP CONSTRAINT "access_events_session_id_fkey";

-- AlterTable
ALTER TABLE "access_events" ADD COLUMN     "exit_code_id" TEXT,
ALTER COLUMN "device_id" DROP NOT NULL,
ALTER COLUMN "session_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "exit_codes" (
    "id" TEXT NOT NULL,
    "gate_id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "exit_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exit_codes_gate_id_idx" ON "exit_codes"("gate_id");

-- CreateIndex
CREATE INDEX "exit_codes_active_idx" ON "exit_codes"("active");

-- AddForeignKey
ALTER TABLE "exit_codes" ADD CONSTRAINT "exit_codes_gate_id_fkey" FOREIGN KEY ("gate_id") REFERENCES "gates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exit_codes" ADD CONSTRAINT "exit_codes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "security_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_exit_code_id_fkey" FOREIGN KEY ("exit_code_id") REFERENCES "exit_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
