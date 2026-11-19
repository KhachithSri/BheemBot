-- QUICK FIX: Create organization for existing user
-- Run this in Supabase SQL Editor

DO $$
DECLARE
  target_user_id uuid;
  org_id uuid;
  proj_id uuid;
  user_email text;
  user_meta jsonb;
BEGIN
  -- Get the first user who doesn't have an organization
  SELECT id, email, raw_user_meta_data 
  INTO target_user_id, user_email, user_meta
  FROM auth.users
  WHERE NOT EXISTS (
    SELECT 1 FROM organization_members 
    WHERE "userId" = auth.users.id
  )
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE NOTICE 'All users already have organizations';
    RETURN;
  END IF;

  org_id := gen_random_uuid();
  proj_id := gen_random_uuid();

  -- Create profile
  INSERT INTO profiles (id, email, name)
  VALUES (
    target_user_id,
    user_email,
    COALESCE(user_meta->>'full_name', SPLIT_PART(user_email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;

  -- Create organization
  INSERT INTO organizations (id, name, slug, "ownerId")
  VALUES (org_id, 'Personal', 'personal-' || target_user_id::text, target_user_id)
  ON CONFLICT (slug) DO UPDATE SET "ownerId" = target_user_id
  RETURNING id INTO org_id;

  -- Add user as owner
  INSERT INTO organization_members ("workspaceId", "userId", role)
  VALUES (org_id, target_user_id, 'OWNER')
  ON CONFLICT ("workspaceId", "userId") DO NOTHING;

  -- Create default project
  INSERT INTO projects (id, "organizationId", name, "createdBy")
  VALUES (proj_id, org_id, 'Default', target_user_id);

  RAISE NOTICE 'Created organization % and project for user %', org_id, target_user_id;
END $$;
