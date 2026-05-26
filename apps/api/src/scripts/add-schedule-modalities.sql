-- Run in Supabase SQL Editor
-- Creates the junction table for Schedule ↔ multiple modalities

CREATE TABLE IF NOT EXISTS schedule_modalities (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "scheduleId" TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  "modalityId" TEXT NOT NULL REFERENCES modality_configs(id) ON DELETE CASCADE,
  capacity     INT  NOT NULL DEFAULT 1,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("scheduleId", "modalityId")
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_schedule_modalities_schedule ON schedule_modalities("scheduleId");
CREATE INDEX IF NOT EXISTS idx_schedule_modalities_modality ON schedule_modalities("modalityId");
