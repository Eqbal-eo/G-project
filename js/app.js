// ============================================
// MOTION — Main Application Controller
// ============================================

import { getCurrentUser, getSession, signOut, onAuthStateChange } from './supabase.js';
import { Router } from './router.js';
import { getWorkspaces, getUserProfile, createPage } from './queries.js';

// Import page modules
import { renderDashboard } from '../pages/dashboard.js';
import { renderKanban } from '../pages/kanban.js';
import { renderNotes } from '../pages/notes.js';
import { renderEditor } from '../pages/editor.js';
import { renderDatabase } from '../pages/database.js';
import { renderSettings } from '../pages/settings.js';
import { renderProfile } from '../pages/profile.js';

// ============================================
// APP STATE
// ============================================

export const AppState = {
  user: null,
  profile: null,
  workspace: null,
  workspaces: [],
  isLoading: true
};

// ============================================
// ROUTER SETUP
// ============================================

const router = new Router();

// Register routes
router
  .addRoute('dashboard', renderDashboard)
  .addRoute('notes', renderNotes)
  .addRoute('editor', renderEditor)
  .addRoute('kanban', renderKanban)
  .addRoute('database', renderDatabase)
  .addRoute('settings', renderSettings)
  .addRoute('profile', renderProfile);

// Auth guard — redirect to login if not authenticated
router.setGuard(async (path) => {
  if (!AppState.user) {
    window.location.href = 'pages/login.html';
    return false;
  }
  return true;
});

// ============================================
// INITIALIZATION
// ============================================

async function initApp() {
  try {
    // Check for existing session
    const session = await getSession();
    
    if (!session) {
      window.location.href = 'pages/login.html';
      return;
    }

    AppState.user = session.user;

    // Load user profile
    const { data: profile } = await getUserProfile(session.user.id);
    AppState.profile = profile;

    // Load workspaces
    const { data: workspaces } = await getWorkspaces();
    AppState.workspaces = workspaces || [];
    AppState.workspace = workspaces?.[0] || null;

    // Render the shell UI
    renderShell();

    // Update header user info
    updateUserUI();

    // Start the router
    AppState.isLoading = false;
    router.start();

  } catch (err) {
    console.error('App initialization error:', err);
    document.body.innerHTML = `
      <div class="error-state" style="min-height:100vh; display:flex; align-items:center; justify-content:center;">
        <div style="text-align:center;">
          <span class="material-symbols-outlined" style="font-size:3rem; opacity:0.3;">error</span>
          <h3 style="margin-top:1rem; font-weight:600;">Failed to load application</h3>
          <p style="font-size:0.875rem; opacity:0.7; margin-top:0.5rem;">${err.message}</p>
          <button onclick="location.reload()" style="margin-top:1.5rem; padding:0.5rem 2rem; background:var(--primary); color:var(--on-primary); border:none; border-radius:var(--radius-md); cursor:pointer; font-weight:600;">
            Retry
          </button>
        </div>
      </div>
    `;
  }
}

// ============================================
// SHELL RENDERING
// ============================================

function renderShell() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="flex h-screen overflow-hidden">
      <!-- Sidebar -->
      <aside id="sidebar" class="h-screen w-64 flex-shrink-0 bg-[#f2f4f3] dark:bg-stone-900 flex flex-col py-6 px-4">
        <!-- Brand -->
        <div class="flex items-center gap-3 mb-8 px-2">
          <div class="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center">
            <span class="material-symbols-outlined text-primary text-xl">monochrome_photos</span>
          </div>
          <div>
            <h1 class="text-lg font-bold tracking-tighter text-[#2d3433] dark:text-stone-100">Motion</h1>
            <p class="font-['Inter'] tracking-tight text-xs text-[#5f5e5e] dark:text-stone-400" id="sidebar-workspace-name">Premium Workspace</p>
          </div>
        </div>

        <!-- New Page Button -->
        <button id="btn-new-page" class="mb-6 mx-2 py-2 px-4 bg-primary text-on-primary rounded-lg font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity">
          <span class="material-symbols-outlined text-sm">add</span>
          New Page
        </button>

        <!-- Navigation -->
        <nav class="flex-grow space-y-1">
          <a href="#dashboard" data-nav-route="dashboard" class="flex items-center gap-3 px-3 py-2 text-[#5a6060] hover:bg-[#e8ebea] rounded-md transition-colors duration-200">
            <span class="material-symbols-outlined">dashboard</span>
            <span class="text-sm">Dashboard</span>
          </a>
          <a href="#notes" data-nav-route="notes" class="flex items-center gap-3 px-3 py-2 text-[#5a6060] hover:bg-[#e8ebea] rounded-md transition-colors duration-200">
            <span class="material-symbols-outlined">description</span>
            <span class="text-sm">Notes</span>
          </a>
          <a href="#database" data-nav-route="database" class="flex items-center gap-3 px-3 py-2 text-[#5a6060] hover:bg-[#e8ebea] rounded-md transition-colors duration-200">
            <span class="material-symbols-outlined">database</span>
            <span class="text-sm">Database</span>
          </a>
          <a href="#kanban" data-nav-route="kanban" class="flex items-center gap-3 px-3 py-2 text-[#5a6060] hover:bg-[#e8ebea] rounded-md transition-colors duration-200">
            <span class="material-symbols-outlined">view_kanban</span>
            <span class="text-sm">Kanban</span>
          </a>
        </nav>

        <!-- Footer Nav -->
        <div class="mt-auto pt-4 space-y-1">
          <a href="#settings" data-nav-route="settings" class="flex items-center gap-3 px-3 py-2 text-[#5a6060] hover:bg-[#e8ebea] rounded-md transition-colors duration-200">
            <span class="material-symbols-outlined">settings</span>
            <span class="text-sm">Settings</span>
          </a>
          <a href="#profile" data-nav-route="profile" class="flex items-center gap-3 px-3 py-2 text-[#5a6060] hover:bg-[#e8ebea] rounded-md transition-colors duration-200">
            <span class="material-symbols-outlined">account_circle</span>
            <span class="text-sm">Profile</span>
          </a>
        </div>
      </aside>

      <!-- Main Content -->
      <main class="flex-grow flex flex-col overflow-y-auto bg-surface">
        <!-- Top Navigation Bar -->
        <header class="sticky top-0 w-full z-40 bg-[#f9f9f8]/70 dark:bg-stone-950/70 backdrop-blur-xl flex justify-between items-center px-6 h-14">
          <div class="flex items-center gap-6">
            <div id="breadcrumb" class="flex items-center gap-2 text-sm text-on-surface-variant">
              <span class="material-symbols-outlined text-sm">home</span>
              <span>/</span>
              <span class="text-[#2d3433] dark:text-stone-100 font-bold" id="breadcrumb-current">Dashboard</span>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-3 text-[#5f5e5e] dark:text-stone-400">
              <span class="material-symbols-outlined cursor-pointer hover:text-on-surface transition-colors">notifications</span>
              <div id="header-avatar" class="w-8 h-8 rounded-full overflow-hidden bg-surface-container-highest cursor-pointer border border-outline-variant/10" onclick="window.location.hash='profile'">
                <div class="w-full h-full flex items-center justify-center text-xs font-bold text-on-surface-variant">U</div>
              </div>
            </div>
          </div>
        </header>

        <!-- Page Content (Router renders here) -->
        <div id="page-content" class="flex-1"></div>
      </main>
    </div>
  `;

  // Bind events
  document.getElementById('btn-new-page').addEventListener('click', handleNewPage);
}

// ============================================
// UI UPDATES
// ============================================

function updateUserUI() {
  const avatarEl = document.getElementById('header-avatar');
  const workspaceNameEl = document.getElementById('sidebar-workspace-name');

  if (AppState.profile) {
    const initials = (AppState.profile.name || AppState.profile.email || 'U')
      .split(' ')
      .map(w => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    if (AppState.profile.avatar_url) {
      avatarEl.innerHTML = `<img class="w-full h-full object-cover" src="${AppState.profile.avatar_url}" alt="Profile" />`;
    } else {
      avatarEl.innerHTML = `<div class="w-full h-full flex items-center justify-center text-xs font-bold text-on-surface-variant">${initials}</div>`;
    }
  }

  if (workspaceNameEl && AppState.workspace) {
    workspaceNameEl.textContent = AppState.workspace.name;
  }
}

/**
 * Update breadcrumb text
 */
export function setBreadcrumb(text) {
  const el = document.getElementById('breadcrumb-current');
  if (el) el.textContent = text;
}

// ============================================
// ACTIONS
// ============================================

async function handleNewPage() {
  if (!AppState.workspace) {
    showToast('No workspace found. Please create one first.', 'error');
    return;
  }

  const { data, error } = await createPage(AppState.workspace.id, 'Untitled');
  if (error) {
    showToast('Failed to create page: ' + error.message, 'error');
    return;
  }

  showToast('New page created!', 'success');
  // Navigate to editor with the new page
  router.navigate('editor');
}

/**
 * Handle sign out
 */
export async function handleSignOut() {
  await signOut();
  window.location.href = 'pages/login.html';
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================

export function showToast(message, type = 'success') {
  // Remove existing toasts
  document.querySelectorAll('.toast').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================
// AUTH STATE LISTENER
// ============================================

onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    window.location.href = 'pages/login.html';
  }
});

// ============================================
// START APPLICATION
// ============================================

document.addEventListener('DOMContentLoaded', initApp);
