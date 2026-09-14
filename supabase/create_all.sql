-- STEP 1: Create types first
DO $$
BEGIN
    CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'ENTERPRISE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE "InterviewMode" AS ENUM ('CHAT', 'VOICE', 'HYBRID');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE "ToneLevel" AS ENUM ('CASUAL', 'PROFESSIONAL', 'FORMAL', 'FRIENDLY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE "FollowUpDepth" AS ENUM ('LIGHT', 'MODERATE', 'DEEP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE "QuestionType" AS ENUM ('OPEN_ENDED', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'CODING', 'WHITEBOARD', 'RESEARCH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE "SessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE "ContentType" AS ENUM ('TEXT', 'AUDIO', 'FILE', 'IMAGE', 'WHITEBOARD', 'CODE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- STEP 2: Create helper function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP 3: Create core tables
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL,
  name text,
  avatar text,
  organization text,
  role "UserRole" NOT NULL DEFAULT 'USER',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  "ownerId" uuid NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "userId" uuid NOT NULL,
  role "MemberRole" NOT NULL DEFAULT 'MEMBER',
  "joinedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("workspaceId", "userId")
);

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  "createdBy" uuid NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "projectId" uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  "userId" uuid NOT NULL,
  role "MemberRole" NOT NULL DEFAULT 'MEMBER',
  "assignedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("projectId", "userId")
);

CREATE TABLE IF NOT EXISTS interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  objective text,
  "assessmentCriteria" jsonb,
  mode "InterviewMode" NOT NULL DEFAULT 'CHAT',
  "allowModeSwitch" boolean NOT NULL DEFAULT true,
  "userId" uuid NOT NULL,
  "projectId" uuid REFERENCES projects(id) ON DELETE SET NULL,
  "aiPersona" text,
  "aiName" text NOT NULL DEFAULT 'Bheem',
  "aiTone" "ToneLevel" NOT NULL DEFAULT 'PROFESSIONAL',
  "followUpDepth" "FollowUpDepth" NOT NULL DEFAULT 'MODERATE',
  language text NOT NULL DEFAULT 'en',
  "llmProvider" text,
  "llmModel" text,
  "isActive" boolean NOT NULL DEFAULT true,
  "timeLimitMinutes" int,
  "customBranding" jsonb,
  "publicSlug" text UNIQUE,
  "requireInvite" boolean NOT NULL DEFAULT false,
  "invitedEmails" text[] NOT NULL DEFAULT '{}',
  "videoMode" boolean NOT NULL DEFAULT false,
  "chatEnabled" boolean NOT NULL DEFAULT true,
  "voiceEnabled" boolean NOT NULL DEFAULT false,
  "videoEnabled" boolean NOT NULL DEFAULT false,
  "antiCheatingEnabled" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "interviewId" uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  "order" int NOT NULL,
  "text" text NOT NULL,
  description text,
  "type" "QuestionType" NOT NULL,
  options jsonb,
  "starterCode" jsonb,
  "validationRules" jsonb,
  "followUpPrompts" jsonb,
  "probeOnShort" boolean NOT NULL DEFAULT true,
  "probeThreshold" int,
  "showIf" jsonb,
  "skipIf" jsonb,
  "timeLimitSeconds" int,
  "isRequired" boolean NOT NULL DEFAULT true,
  "allowFileUpload" boolean NOT NULL DEFAULT false,
  "allowedFileTypes" text[] NOT NULL DEFAULT '{}',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "interviewId" uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  "participantEmail" text,
  "participantName" text,
  "participantPhone" text,
  "participantMetadata" jsonb,
  status "SessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "currentQuestionId" uuid,
  "modeUsed" "InterviewMode" NOT NULL DEFAULT 'CHAT',
  "modeSwitches" int NOT NULL DEFAULT 0,
  summary text,
  insights jsonb,
  themes text[] NOT NULL DEFAULT '{}',
  sentiment jsonb,
  "startedAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz,
  "lastActivityAt" timestamptz NOT NULL DEFAULT now(),
  "totalDurationSeconds" int,
  "audioRecordingUrl" text,
  screenshots jsonb,
  "audioDuration" real,
  "antiCheatingLog" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "activitySegments" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "audioRecordings" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "interviewId" uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  gender text,
  birthday text,
  notes text,
  education text,
  school text,
  major text,
  "graduationYear" int,
  "workExperience" text,
  "inviteToken" text UNIQUE,
  "sessionId" uuid REFERENCES sessions(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sessionId" uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role "MessageRole" NOT NULL,
  content text NOT NULL,
  "contentType" "ContentType" NOT NULL DEFAULT 'TEXT',
  "audioUrl" text,
  "audioDurationSeconds" int,
  transcription text,
  "whiteboardData" jsonb,
  "whiteboardImageUrl" text,
  "whiteboardPages" int NOT NULL DEFAULT 1,
  "questionId" uuid,
  "isFollowUp" boolean NOT NULL DEFAULT false,
  "parentMessageId" uuid,
  sentiment text,
  "wordCount" int,
  "readingTimeSeconds" int,
  "timestamp" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL,
  name text NOT NULL,
  key text UNIQUE NOT NULL,
  "lastUsedAt" timestamptz,
  "expiresAt" timestamptz,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid,
  action text NOT NULL,
  "resourceType" text NOT NULL,
  "resourceId" text,
  metadata jsonb,
  "ipAddress" text,
  "userAgent" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  secret text,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

-- STEP 4: Add triggers
DROP TRIGGER IF EXISTS set_updated_at ON profiles;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON organizations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON projects;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON interviews;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON interviews FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON questions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON questions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON sessions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON candidates;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON candidates FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON webhooks;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON webhooks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- STEP 5: Create auth handler function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id uuid;
  proj_id uuid;
BEGIN
  INSERT INTO public.profiles (id, email, name, avatar)
  VALUES (
    NEW.id, NEW.email,
    coalesce(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    name = coalesce(excluded.name, profiles.name),
    avatar = coalesce(excluded.avatar, profiles.avatar);

  org_id := gen_random_uuid();
  proj_id := gen_random_uuid();

  INSERT INTO public.organizations (id, name, slug, "ownerId")
  VALUES (org_id, 'Personal', 'personal-' || NEW.id::text, NEW.id)
  ON CONFLICT (slug) DO NOTHING;

  IF FOUND THEN
    INSERT INTO public.organization_members ("workspaceId", "userId", role)
    VALUES (org_id, NEW.id, 'OWNER');
    INSERT INTO public.projects (id, "organizationId", name, "createdBy")
    VALUES (proj_id, org_id, 'Default', NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- STEP 6: Fix existing users
DO $$
DECLARE
  user_rec record;
  org_id uuid;
  proj_id uuid;
BEGIN
  FOR user_rec IN 
    SELECT au.id, au.email, au.raw_user_meta_data 
    FROM auth.users au
    WHERE NOT EXISTS (
      SELECT 1 FROM organization_members om 
      WHERE om."userId" = au.id
    )
  LOOP
    org_id := gen_random_uuid();
    proj_id := gen_random_uuid();
    
    INSERT INTO profiles (id, email, name)
    VALUES (user_rec.id, user_rec.email, 
      coalesce(user_rec.raw_user_meta_data->>'full_name', split_part(user_rec.email, '@', 1)))
    ON CONFLICT (id) DO NOTHING;
    
    INSERT INTO organizations (id, name, slug, "ownerId")
    VALUES (org_id, 'Personal', 'personal-' || user_rec.id::text, user_rec.id)
    ON CONFLICT (slug) DO UPDATE SET "ownerId" = user_rec.id
    RETURNING id INTO org_id;
    
    INSERT INTO organization_members ("workspaceId", "userId", role)
    VALUES (org_id, user_rec.id, 'OWNER')
    ON CONFLICT ("workspaceId", "userId") DO NOTHING;
    
    INSERT INTO projects (id, "organizationId", name, "createdBy")
    VALUES (proj_id, org_id, 'Default', user_rec.id);
  END LOOP;
END $$;

-- STEP 7: Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;

-- STEP 8: Create RLS policies
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "org_select" ON organizations;
DROP POLICY IF EXISTS "org_insert" ON organizations;
CREATE POLICY "org_select" ON organizations FOR SELECT USING ("ownerId" = auth.uid());
CREATE POLICY "org_insert" ON organizations FOR INSERT WITH CHECK ("ownerId" = auth.uid());

DROP POLICY IF EXISTS "org_members_select" ON organization_members;
DROP POLICY IF EXISTS "org_members_insert" ON organization_members;
CREATE POLICY "org_members_select" ON organization_members FOR SELECT USING ("userId" = auth.uid());
CREATE POLICY "org_members_insert" ON organization_members FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "projects_select" ON projects;
DROP POLICY IF EXISTS "projects_insert" ON projects;
CREATE POLICY "projects_select" ON projects FOR SELECT USING (true);
CREATE POLICY "projects_insert" ON projects FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "project_members_select" ON project_members;
CREATE POLICY "project_members_select" ON project_members FOR SELECT USING (true);

DROP POLICY IF EXISTS "interviews_select" ON interviews;
DROP POLICY IF EXISTS "interviews_insert" ON interviews;
DROP POLICY IF EXISTS "interviews_update" ON interviews;
DROP POLICY IF EXISTS "interviews_delete" ON interviews;
CREATE POLICY "interviews_select" ON interviews FOR SELECT USING ("userId" = auth.uid());
CREATE POLICY "interviews_insert" ON interviews FOR INSERT WITH CHECK ("userId" = auth.uid());
CREATE POLICY "interviews_update" ON interviews FOR UPDATE USING ("userId" = auth.uid());
CREATE POLICY "interviews_delete" ON interviews FOR DELETE USING ("userId" = auth.uid());

DROP POLICY IF EXISTS "questions_select" ON questions;
DROP POLICY IF EXISTS "questions_insert" ON questions;
CREATE POLICY "questions_select" ON questions FOR SELECT USING (true);
CREATE POLICY "questions_insert" ON questions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "sessions_select" ON sessions;
DROP POLICY IF EXISTS "sessions_insert" ON sessions;
CREATE POLICY "sessions_select" ON sessions FOR SELECT USING (true);
CREATE POLICY "sessions_insert" ON sessions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "candidates_select" ON candidates;
DROP POLICY IF EXISTS "candidates_insert" ON candidates;
CREATE POLICY "candidates_select" ON candidates FOR SELECT USING (true);
CREATE POLICY "candidates_insert" ON candidates FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "messages_select" ON messages;
DROP POLICY IF EXISTS "messages_insert" ON messages;
CREATE POLICY "messages_select" ON messages FOR SELECT USING (true);
CREATE POLICY "messages_insert" ON messages FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "api_keys_select" ON api_keys;
DROP POLICY IF EXISTS "api_keys_insert" ON api_keys;
CREATE POLICY "api_keys_select" ON api_keys FOR SELECT USING ("userId" = auth.uid());
CREATE POLICY "api_keys_insert" ON api_keys FOR INSERT WITH CHECK ("userId" = auth.uid());

DROP POLICY IF EXISTS "webhooks_select" ON webhooks;
DROP POLICY IF EXISTS "webhooks_insert" ON webhooks;
CREATE POLICY "webhooks_select" ON webhooks FOR SELECT USING ("userId" = auth.uid());
CREATE POLICY "webhooks_insert" ON webhooks FOR INSERT WITH CHECK ("userId" = auth.uid());

-- Done!
SELECT 'Database schema created successfully!' as status;
