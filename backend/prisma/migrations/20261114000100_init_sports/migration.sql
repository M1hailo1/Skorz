-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "match_status" AS ENUM ('scheduled', 'live', 'finished');

-- CreateTable
CREATE TABLE "matches" (
    "id" SERIAL NOT NULL,
    "sport" TEXT NOT NULL,
    "home_team" TEXT NOT NULL,
    "away_team" TEXT NOT NULL,
    "status" "match_status" NOT NULL DEFAULT 'scheduled',
    "start_time" TIMESTAMPTZ(3) NOT NULL,
    "end_time" TIMESTAMPTZ(3),
    "home_score" INTEGER NOT NULL DEFAULT 0,
    "away_score" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commentary" (
    "id" SERIAL NOT NULL,
    "match_id" INTEGER NOT NULL,
    "minute" INTEGER,
    "sequence" INTEGER NOT NULL,
    "period" TEXT,
    "event_type" TEXT,
    "actor" TEXT,
    "team" TEXT,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commentary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "matches_status_start_time_idx" ON "matches"("status", "start_time");

-- CreateIndex
CREATE UNIQUE INDEX "commentary_match_id_sequence_key" ON "commentary"("match_id", "sequence");

-- AddForeignKey
ALTER TABLE "commentary" ADD CONSTRAINT "commentary_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
