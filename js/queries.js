// ============================================
// MOTION — Data Access Layer (Supabase Queries)
// ============================================

import { supabase } from './supabase.js';

// ============================================
// USER QUERIES
// ============================================

/**
 * Get user profile by ID
 */
export async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  return { data, error };
}

/**
 * Update user profile
 */
export async function updateUserProfile(userId, updates) {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  return { data, error };
}

// ============================================
// WORKSPACE QUERIES
// ============================================

/**
 * Get all workspaces for the current user
 */
export async function getWorkspaces() {
  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .order('created_at', { ascending: false });
  return { data: data || [], error };
}

/**
 * Get workspace by ID
 */
export async function getWorkspace(workspaceId) {
  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', workspaceId)
    .single();
  return { data, error };
}

/**
 * Create a new workspace
 */
export async function createWorkspace(name, ownerId) {
  const { data, error } = await supabase
    .from('workspaces')
    .insert({ name, owner_id: ownerId })
    .select()
    .single();
  return { data, error };
}

// ============================================
// PAGE QUERIES
// ============================================

/**
 * Get all pages in a workspace
 */
export async function getPages(workspaceId) {
  const { data, error } = await supabase
    .from('pages')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false });
  return { data: data || [], error };
}

/**
 * Get recent pages across all workspaces (limit N)
 */
export async function getRecentPages(limit = 4) {
  const { data, error } = await supabase
    .from('pages')
    .select('*, workspaces!inner(owner_id)')
    .order('updated_at', { ascending: false })
    .limit(limit);
  return { data: data || [], error };
}

/**
 * Get a single page by ID
 */
export async function getPage(pageId) {
  const { data, error } = await supabase
    .from('pages')
    .select('*')
    .eq('id', pageId)
    .single();
  return { data, error };
}

/**
 * Create a new page
 */
export async function createPage(workspaceId, title = 'Untitled', pageType = 'note') {
  const { data, error } = await supabase
    .from('pages')
    .insert({
      workspace_id: workspaceId,
      title,
      page_type: pageType,
      content: {}
    })
    .select()
    .single();
  return { data, error };
}

/**
 * Update a page
 */
export async function updatePage(pageId, updates) {
  const { data, error } = await supabase
    .from('pages')
    .update(updates)
    .eq('id', pageId)
    .select()
    .single();
  return { data, error };
}

/**
 * Delete a page
 */
export async function deletePage(pageId) {
  const { error } = await supabase
    .from('pages')
    .delete()
    .eq('id', pageId);
  return { error };
}

// ============================================
// NOTE QUERIES
// ============================================

/**
 * Get all notes for a page
 */
export async function getNotes(pageId) {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('page_id', pageId)
    .order('sort_order', { ascending: true });
  return { data: data || [], error };
}

/**
 * Create a note
 */
export async function createNote(pageId, content = '') {
  const { data, error } = await supabase
    .from('notes')
    .insert({ page_id: pageId, content })
    .select()
    .single();
  return { data, error };
}

/**
 * Update a note
 */
export async function updateNote(noteId, content) {
  const { data, error } = await supabase
    .from('notes')
    .update({ content })
    .eq('id', noteId)
    .select()
    .single();
  return { data, error };
}

/**
 * Delete a note
 */
export async function deleteNote(noteId) {
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', noteId);
  return { error };
}

// ============================================
// TASK QUERIES
// ============================================

/**
 * Get all tasks (optionally filter by page or status)
 */
export async function getTasks({ pageId, status, limit } = {}) {
  let query = supabase
    .from('tasks')
    .select('*, assignee:users(id, name, avatar_url)')
    .order('sort_order', { ascending: true });

  if (pageId) query = query.eq('page_id', pageId);
  if (status) query = query.eq('status', status);
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  return { data: data || [], error };
}

/**
 * Get task counts by status
 */
export async function getTaskCounts() {
  const { data, error } = await supabase
    .from('tasks')
    .select('status');

  if (error) return { data: { total: 0, todo: 0, in_progress: 0, done: 0 }, error };

  const counts = {
    total: data.length,
    todo: data.filter(t => t.status === 'todo').length,
    in_progress: data.filter(t => t.status === 'in_progress').length,
    done: data.filter(t => t.status === 'done').length
  };
  return { data: counts, error: null };
}

/**
 * Create a task
 */
export async function createTask(title, { pageId, status = 'todo', priority = 'medium', assigneeId, dueDate, tags } = {}) {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title,
      page_id: pageId || null,
      status,
      priority,
      assignee_id: assigneeId || null,
      due_date: dueDate || null,
      tags: tags || []
    })
    .select('*, assignee:users(id, name, avatar_url)')
    .single();
  return { data, error };
}

/**
 * Update a task
 */
export async function updateTask(taskId, updates) {
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .select('*, assignee:users(id, name, avatar_url)')
    .single();
  return { data, error };
}

/**
 * Toggle task completion
 */
export async function toggleTask(taskId, completed) {
  return updateTask(taskId, {
    completed,
    status: completed ? 'done' : 'todo'
  });
}

/**
 * Delete a task
 */
export async function deleteTask(taskId) {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId);
  return { error };
}

// ============================================
// SETTINGS QUERIES
// ============================================

/**
 * Get user settings
 */
export async function getSettings(userId) {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', userId)
    .single();
  return { data, error };
}

/**
 * Update user settings
 */
export async function updateSettings(userId, updates) {
  const { data, error } = await supabase
    .from('settings')
    .update(updates)
    .eq('user_id', userId)
    .select()
    .single();
  return { data, error };
}

/**
 * Update specific preferences within settings
 */
export async function updatePreferences(userId, preferences) {
  const { data: current } = await getSettings(userId);
  const merged = { ...current?.preferences, ...preferences };
  return updateSettings(userId, { preferences: merged });
}

// ============================================
// UTILITY: Relative time formatting
// ============================================

/**
 * Format a timestamp as relative time (e.g., "2 hours ago")
 */
export function timeAgo(timestamp) {
  const now = new Date();
  const then = new Date(timestamp);
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
