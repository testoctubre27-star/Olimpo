-- Run this in Supabase Dashboard → SQL Editor if prisma db push fails
-- Adds tutorName and enrolledAt to students table

ALTER TABLE students ADD COLUMN IF NOT EXISTS "tutorName"  TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS "enrolledAt" TIMESTAMPTZ;
