-- ============================================
-- MOTION (G-Project) — Supabase Database Schema
-- ============================================
-- Run this as a migration in your Supabase project.
-- Requires Supabase Auth to be configured.
-- ============================================

-- ============================================
-- 1. USERS TABLE
-- Extends Supabase Auth with profile data
-- ============================================
CREATE TABLE IF NOT EXISTS public.users (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email text NOT NULL,
  name text,
  avatar_url text,
  created_at timestamptz DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.users IS 'User profile data extending Supabase Auth';

-- ============================================
-- 2. WORKSPACES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL DEFAULT 'My Workspace',
  owner_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.workspaces IS 'Workspaces owned by users';

-- ============================================
-- 3. PAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.pages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL DEFAULT 'Untitled',
  content jsonb DEFAULT '{}',
  icon text DEFAULT '📄',
  cover_url text,
  page_type text DEFAULT 'note' CHECK (page_type IN ('note', 'database', 'kanban', 'document')),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.pages IS 'Pages within a workspace (notes, databases, kanban boards)';

-- ============================================
-- 4. NOTES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id uuid REFERENCES public.pages(id) ON DELETE CASCADE NOT NULL,
  content text DEFAULT '',
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.notes IS 'Note blocks within a page';

-- ============================================
-- 5. TASKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  completed boolean DEFAULT false,
  page_id uuid REFERENCES public.pages(id) ON DELETE CASCADE,
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date date,
  assignee_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status text DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  tags text[] DEFAULT '{}',
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.tasks IS 'Tasks that can belong to a page or standalone';

-- ============================================
-- 6. SETTINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  theme text DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'system')),
  preferences jsonb DEFAULT '{
    "email_notifications": true,
    "direct_messages": true,
    "product_updates": false
  }'::jsonb
);

COMMENT ON TABLE public.settings IS 'Per-user settings and preferences';

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON public.workspaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_pages_workspace ON public.pages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pages_updated ON public.pages(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_page ON public.notes(page_id);
CREATE INDEX IF NOT EXISTS idx_tasks_page ON public.tasks(page_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON public.tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_settings_user ON public.settings(user_id);

-- ============================================
-- TRIGGERS: Auto-update updated_at on pages
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_pages_updated_at ON public.pages;
CREATE TRIGGER trigger_pages_updated_at
  BEFORE UPDATE ON public.pages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- TRIGGER: Auto-create user profile on signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NULL)
  );

  -- Auto-create default workspace
  INSERT INTO public.workspaces (name, owner_id)
  VALUES ('My Workspace', NEW.id);

  -- Auto-create default settings
  INSERT INTO public.settings (user_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- USERS: Users can read/update their own profile
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- WORKSPACES: Owners can CRUD their workspaces
CREATE POLICY "Owners can view own workspaces" ON public.workspaces
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Owners can create workspaces" ON public.workspaces
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update own workspaces" ON public.workspaces
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete own workspaces" ON public.workspaces
  FOR DELETE USING (auth.uid() = owner_id);

-- PAGES: Users can CRUD pages in their workspaces
CREATE POLICY "Users can view pages in own workspaces" ON public.pages
  FOR SELECT USING (
    workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())
  );

CREATE POLICY "Users can create pages in own workspaces" ON public.pages
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())
  );

CREATE POLICY "Users can update pages in own workspaces" ON public.pages
  FOR UPDATE USING (
    workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())
  );

CREATE POLICY "Users can delete pages in own workspaces" ON public.pages
  FOR DELETE USING (
    workspace_id IN (SELECT id FROM public.workspaces WHERE owner_id = auth.uid())
  );

-- NOTES: Users can CRUD notes in their pages
CREATE POLICY "Users can view own notes" ON public.notes
  FOR SELECT USING (
    page_id IN (
      SELECT p.id FROM public.pages p
      JOIN public.workspaces w ON p.workspace_id = w.id
      WHERE w.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can create notes" ON public.notes
  FOR INSERT WITH CHECK (
    page_id IN (
      SELECT p.id FROM public.pages p
      JOIN public.workspaces w ON p.workspace_id = w.id
      WHERE w.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own notes" ON public.notes
  FOR UPDATE USING (
    page_id IN (
      SELECT p.id FROM public.pages p
      JOIN public.workspaces w ON p.workspace_id = w.id
      WHERE w.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own notes" ON public.notes
  FOR DELETE USING (
    page_id IN (
      SELECT p.id FROM public.pages p
      JOIN public.workspaces w ON p.workspace_id = w.id
      WHERE w.owner_id = auth.uid()
    )
  );

-- TASKS: Users can CRUD tasks in their pages
CREATE POLICY "Users can view own tasks" ON public.tasks
  FOR SELECT USING (
    page_id IS NULL AND assignee_id = auth.uid()
    OR page_id IN (
      SELECT p.id FROM public.pages p
      JOIN public.workspaces w ON p.workspace_id = w.id
      WHERE w.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can create tasks" ON public.tasks
  FOR INSERT WITH CHECK (
    page_id IS NULL AND assignee_id = auth.uid()
    OR page_id IN (
      SELECT p.id FROM public.pages p
      JOIN public.workspaces w ON p.workspace_id = w.id
      WHERE w.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own tasks" ON public.tasks
  FOR UPDATE USING (
    page_id IS NULL AND assignee_id = auth.uid()
    OR page_id IN (
      SELECT p.id FROM public.pages p
      JOIN public.workspaces w ON p.workspace_id = w.id
      WHERE w.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own tasks" ON public.tasks
  FOR DELETE USING (
    page_id IS NULL AND assignee_id = auth.uid()
    OR page_id IN (
      SELECT p.id FROM public.pages p
      JOIN public.workspaces w ON p.workspace_id = w.id
      WHERE w.owner_id = auth.uid()
    )
  );

-- SETTINGS: Users can CRUD own settings
CREATE POLICY "Users can view own settings" ON public.settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own settings" ON public.settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" ON public.settings
  FOR UPDATE USING (auth.uid() = user_id);
