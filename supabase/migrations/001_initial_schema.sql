-- ============================================
-- Deal Tracker Initial Schema Migration
-- ============================================

-- ============================================
-- 1. DEALS TABLE
-- ============================================
CREATE TABLE deals (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    value INTEGER NOT NULL,
    forecast_category TEXT NOT NULL,
    close_date DATE NOT NULL,
    stage TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_contacted TIMESTAMP WITH TIME ZONE,
    notes TEXT NOT NULL DEFAULT '',
    stakeholders JSONB NOT NULL DEFAULT '[]'::jsonb,
    nurtures_sent JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Enable RLS on deals
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own deals
CREATE POLICY "Users can view own deals"
    ON deals FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can insert their own deals
CREATE POLICY "Users can insert own deals"
    ON deals FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own deals
CREATE POLICY "Users can update own deals"
    ON deals FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own deals
CREATE POLICY "Users can delete own deals"
    ON deals FOR DELETE
    USING (auth.uid() = user_id);

-- Index for faster queries by user_id
CREATE INDEX idx_deals_user_id ON deals(user_id);

-- ============================================
-- 2. NURTURES TABLE
-- ============================================
CREATE TABLE nurtures (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS on nurtures
ALTER TABLE nurtures ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own nurtures
CREATE POLICY "Users can view own nurtures"
    ON nurtures FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can insert their own nurtures
CREATE POLICY "Users can insert own nurtures"
    ON nurtures FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own nurtures
CREATE POLICY "Users can update own nurtures"
    ON nurtures FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own nurtures
CREATE POLICY "Users can delete own nurtures"
    ON nurtures FOR DELETE
    USING (auth.uid() = user_id);

-- Index for faster queries by user_id
CREATE INDEX idx_nurtures_user_id ON nurtures(user_id);

-- ============================================
-- 3. ON_HOLD_DEALS TABLE
-- ============================================
CREATE TABLE on_hold_deals (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    value INTEGER NOT NULL,
    forecast_category TEXT NOT NULL,
    close_date DATE NOT NULL,
    stage TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_contacted TIMESTAMP WITH TIME ZONE,
    notes TEXT NOT NULL DEFAULT '',
    stakeholders JSONB NOT NULL DEFAULT '[]'::jsonb,
    nurtures_sent JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Enable RLS on on_hold_deals
ALTER TABLE on_hold_deals ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own on_hold_deals
CREATE POLICY "Users can view own on_hold_deals"
    ON on_hold_deals FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can insert their own on_hold_deals
CREATE POLICY "Users can insert own on_hold_deals"
    ON on_hold_deals FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own on_hold_deals
CREATE POLICY "Users can update own on_hold_deals"
    ON on_hold_deals FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own on_hold_deals
CREATE POLICY "Users can delete own on_hold_deals"
    ON on_hold_deals FOR DELETE
    USING (auth.uid() = user_id);

-- Index for faster queries by user_id
CREATE INDEX idx_on_hold_deals_user_id ON on_hold_deals(user_id);
