-- Add paymentDay to students table
-- This stores the day of month (1-28) when each student pays
ALTER TABLE students ADD COLUMN IF NOT EXISTS "paymentDay" INTEGER;

-- Default: use the day they enrolled, or day 1 if unknown
UPDATE students 
SET "paymentDay" = EXTRACT(DAY FROM COALESCE("enrolledAt", "createdAt"))::INTEGER
WHERE "paymentDay" IS NULL;
