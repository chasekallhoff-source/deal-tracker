-- Add previous_stage column to on_hold_deals table
-- This tracks what stage the deal was in before being moved to On Hold

ALTER TABLE on_hold_deals ADD COLUMN IF NOT EXISTS previous_stage TEXT;
