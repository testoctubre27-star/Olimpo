-- Run in Supabase SQL Editor to add pairedWithId to schedules
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS "pairedWithId" TEXT REFERENCES schedules(id);
