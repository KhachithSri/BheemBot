-- Bheem Database Setup & Health Check
-- Run this in your Supabase SQL Editor to verify everything is set up correctly

-- Check if required tables exist
DO $$
DECLARE
    missing_tables text[] := ARRAY[]::text[];
    required_tables text[] := ARRAY[
        'profiles',
        'organizations', 
        'organization_members',
        'projects',
        'project_members',
        'interviews',
        'questions',
        'sessions',
        'candidates',
        'messages',
        'api_keys',
        'audit_logs',
        'webhooks',
        'support_tickets'
    ];
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY required_tables
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            missing_tables := array_append(missing_tables, tbl);
        END IF;
    END LOOP;
    
    IF array_length(missing_tables, 1) > 0 THEN
        RAISE NOTICE 'MISSING TABLES: %', missing_tables;
        RAISE NOTICE 'Please run the migrations in 001_initial_schema.sql';
    ELSE
        RAISE NOTICE 'All required tables exist!';
    END IF;
END $$;

-- Check interviews table columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'interviews'
ORDER BY ordinal_position;

-- Check if critical columns exist in interviews
SELECT 
    'assessmentCriteria' as column_name,
    EXISTS (SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'interviews' AND column_name = 'assessmentCriteria') as exists
UNION ALL
SELECT 'aiName', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'interviews' AND column_name = 'aiName')
UNION ALL
SELECT 'aiTone', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'interviews' AND column_name = 'aiTone')
UNION ALL
SELECT 'followUpDepth', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'interviews' AND column_name = 'followUpDepth')
UNION ALL
SELECT 'timeLimitMinutes', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'interviews' AND column_name = 'timeLimitMinutes')
UNION ALL
SELECT 'chatEnabled', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'interviews' AND column_name = 'chatEnabled')
UNION ALL
SELECT 'voiceEnabled', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'interviews' AND column_name = 'voiceEnabled')
UNION ALL
SELECT 'videoEnabled', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'interviews' AND column_name = 'videoEnabled')
UNION ALL
SELECT 'antiCheatingEnabled', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'interviews' AND column_name = 'antiCheatingEnabled')
UNION ALL
SELECT 'videoMode', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'interviews' AND column_name = 'videoMode');

-- Check auth trigger
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- Check if handle_new_user function exists
SELECT 
    routine_name,
    routine_type
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'handle_new_user';
