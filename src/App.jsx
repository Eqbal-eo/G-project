import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, showToast } from './legacy/app.js';
import { getSession, onAuthStateChange } from './lib/supabase.js';
import { createPage, getUserProfile, getSettings, updateSettings, getWorkspaces, getRecentPages } from './lib/queries.js';
import Login from './components/Login.jsx';
import Modal, { PromptDialog } from './components/Modal.jsx';
import './App.css';

import { renderDashboard } from './legacy/pages/dashboard.js';
import { renderNotes } from './legacy/pages/notes.js';
import { renderEditor } from './legacy/pages/editor.js';
import { renderKanban } from './legacy/pages/kanban.js';
import { renderDatabase } from './legacy/pages/database.js';
import { renderSettings } from './legacy/pages/settings.js';
import { renderProfile } from './legacy/pages/profile.js';

function parseHash() {
  const raw = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;

  const safe = raw || 'dashboard';
  const [pathPart, queryPart] = safe.split('?');
  const parts = (pathPart || 'dashboard').split('/').filter(Boolean);
  const path = parts[0] || 'dashboard';
  const segments = parts.slice(1);
  const query = new URLSearchParams(queryPart || '');
  return { raw: safe, path, segments, query };
}

function LegacyRenderer({ renderer, routeKey, route }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!renderer || !ref.current) return;

    ref.current.innerHTML = `
      <div class="loading-overlay" style="position:relative; min-height:60vh;">
        <div class="loading-spinner"></div>
      </div>
    `;

    Promise.resolve()
      .then(() => renderer(ref.current, route))
      .catch((err) => {
        console.error('Legacy render error:', err);
        ref.current.innerHTML = `
          <div class="error-state" style="margin:2rem;">
            <span class="material-symbols-outlined" style="font-size:2.5rem; margin-bottom:0.5rem;">error</span>
            <h3 style="font-weight:600; margin-bottom:0.25rem;">Something went wrong</h3>
            <p style="font-size:0.875rem; opacity:0.7;">${err?.message || String(err)}</p>
          </div>
        `;
      });
  }, [renderer, routeKey]);

  return <div ref={ref} />;
}

function updateNavActiveState(activeRoute) {
  const navLinks = document.querySelectorAll('[data-nav-route]');
  navLinks.forEach((link) => {
    const route = link.getAttribute('data-nav-route');
    if (route === activeRoute) {
      link.className =
        'flex items-center gap-3 px-3 py-2 bg-white dark:bg-stone-800 text-[#2d3433] dark:text-stone-100 font-semibold rounded-md shadow-sm transition-colors duration-200';
    } else {
      link.className =
        'flex items-center gap-3 px-3 py-2 text-[#5a6060] dark:text-stone-400 hover:bg-[#e8ebea] dark:hover:bg-stone-800/50 rounded-md transition-colors duration-200';
    }
  });
}

// ============================================
// Theme Management
// ============================================
function getInitialTheme() {
  const saved = localStorage.getItem('motion-theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  const html = document.documentElement;
  if (theme === 'dark') {
    html.classList.add('dark');
    html.classList.remove('light');
  } else {
    html.classList.add('light');
    html.classList.remove('dark');
  }
  localStorage.setItem('motion-theme', theme);
}

export default function App() {
  const [route, setRoute] = useState(() => parseHash());
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [breadcrumb, setBreadcrumb] = useState('Dashboard');
  const [toast, setToast] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);
  const [notifOpen, setNotifOpen] = useState(false);
  const [recentActivity, setRecentActivity] = useState([]);
  const [newPageModalOpen, setNewPageModalOpen] = useState(false);

  // Force re-render when AppState changes
  const [, forceUpdate] = useState(0);

  const routeKey = useMemo(() => route.raw, [route.raw]);

  const renderer = useMemo(() => {
    const map = {
      dashboard: renderDashboard,
      notes: renderNotes,
      editor: renderEditor,
      kanban: renderKanban,
      database: renderDatabase,
      settings: renderSettings,
      profile: renderProfile
    };
    return map[route.path] || renderDashboard;
  }, [route.path]);

  const showShell = route.path !== 'login';

  // Apply theme on mount and changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      // Also save to Supabase if logged in
      if (AppState.user?.id) {
        updateSettings(AppState.user.id, { theme: next }).catch(() => {});
      }
      return next;
    });
  }, []);

  // Hash change listener
  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseHash());
      setSidebarOpen(false); // Close sidebar on navigation (mobile)
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Update active nav state
  useEffect(() => {
    updateNavActiveState(route.path);
  }, [route.path]);

  // Custom event listeners
  useEffect(() => {
    const onCrumb = (e) => setBreadcrumb(e.detail || '');
    const onToast = (e) => {
      setToast(e.detail);
      window.setTimeout(() => setToast(null), 3000);
    };
    window.addEventListener('motion:breadcrumb', onCrumb);
    window.addEventListener('motion:toast', onToast);
    return () => {
      window.removeEventListener('motion:breadcrumb', onCrumb);
      window.removeEventListener('motion:toast', onToast);
    };
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyboard = (e) => {
      // Ctrl+K or Cmd+K = Focus search (future)
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        setNewPageModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, []);

  // Bootstrap auth
  useEffect(() => {
    let unsub = null;

    async function bootstrap() {
      setIsBootstrapping(true);
      try {
        const session = await getSession();
        if (!session) {
          AppState.user = null;
          AppState.profile = null;
          AppState.workspaces = [];
          AppState.workspace = null;
          AppState.isLoading = false;
          if (parseHash().path !== 'login') window.location.hash = 'login';
          return;
        }

        AppState.user = session.user;

        const [{ data: profile }, { data: workspaces }, { data: settings }] = await Promise.all([
          getUserProfile(session.user.id),
          getWorkspaces(),
          getSettings(session.user.id)
        ]);

        AppState.profile = profile || null;
        AppState.workspaces = workspaces || [];
        AppState.workspace = workspaces?.[0] || null;
        AppState.isLoading = false;

        // Apply saved theme preference from DB
        if (settings?.theme && (settings.theme === 'dark' || settings.theme === 'light')) {
          setTheme(settings.theme);
        }

        // Load recent activity for notification bell
        const { data: activityPages } = await getRecentPages(5);
        setRecentActivity(activityPages || []);

        forceUpdate((n) => n + 1);

        // If we're on login but already have a session, go home.
        if (parseHash().path === 'login') window.location.hash = 'dashboard';
      } catch (err) {
        console.error('Bootstrap error:', err);
        showToast(err?.message || 'Failed to bootstrap app', 'error');
      } finally {
        setIsBootstrapping(false);
      }
    }

    bootstrap();

    const { data } = onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        AppState.user = null;
        AppState.profile = null;
        AppState.workspaces = [];
        AppState.workspace = null;
        window.location.hash = 'login';
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        bootstrap();
      }
    });
    unsub = data?.subscription;

    return () => {
      try {
        unsub?.unsubscribe?.();
      } catch {
        // ignore
      }
    };
  }, []);

  // New page creation via modal
  async function handleCreatePage(title) {
    if (!AppState.workspace) {
      showToast('No workspace found. Please create one first.', 'error');
      return;
    }

    const { data, error } = await createPage(AppState.workspace.id, title || 'Untitled');
    if (error) {
      showToast('Failed to create page: ' + error.message, 'error');
      return;
    }
    showToast('New page created!', 'success');
    window.location.hash = data?.id ? `editor/${data.id}` : 'editor';
  }

  // Computed values
  const avatarUrl = AppState.profile?.avatar_url;
  const userInitials =
    (AppState.profile?.name || AppState.user?.email || 'U')
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U';

  const workspaceName = AppState.workspace?.name || 'Premium Workspace';

  // Close notification dropdown when clicking outside
  useEffect(() => {
    if (!notifOpen) return;
    const handleClick = (e) => {
      if (!e.target.closest('#notif-area')) setNotifOpen(false);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [notifOpen]);

  if (!showShell) {
    return <Login isBootstrapping={isBootstrapping} />;
  }

  function timeAgoShort(ts) {
    const now = new Date();
    const then = new Date(ts);
    const seconds = Math.floor((now - then) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside
        id="sidebar"
        className={`h-screen w-64 flex-shrink-0 bg-[#f2f4f3] dark:bg-stone-900 flex flex-col py-6 px-4 ${sidebarOpen ? 'sidebar-open' : ''}`}
      >
        <div className="flex items-center gap-3 mb-8 px-2">
          <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-xl">monochrome_photos</span>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tighter text-[#2d3433] dark:text-stone-100">Motion</h1>
            <p
              className="font-['Inter'] tracking-tight text-xs text-[#5f5e5e] dark:text-stone-400"
              id="sidebar-workspace-name"
            >
              {workspaceName}
            </p>
          </div>
        </div>

        <button
          id="btn-new-page"
          onClick={() => setNewPageModalOpen(true)}
          className="mb-6 mx-2 py-2 px-4 bg-primary text-on-primary rounded-lg font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
          type="button"
        >
          <span className="material-symbols-outlined text-sm">add</span>
          New Page
        </button>

        <nav className="flex-grow space-y-1">
          <a
            href="#dashboard"
            data-nav-route="dashboard"
            className="flex items-center gap-3 px-3 py-2 text-[#5a6060] hover:bg-[#e8ebea] rounded-md transition-colors duration-200"
          >
            <span className="material-symbols-outlined">dashboard</span>
            <span className="text-sm">Dashboard</span>
          </a>
          <a
            href="#notes"
            data-nav-route="notes"
            className="flex items-center gap-3 px-3 py-2 text-[#5a6060] hover:bg-[#e8ebea] rounded-md transition-colors duration-200"
          >
            <span className="material-symbols-outlined">description</span>
            <span className="text-sm">Notes</span>
          </a>
          <a
            href="#database"
            data-nav-route="database"
            className="flex items-center gap-3 px-3 py-2 text-[#5a6060] hover:bg-[#e8ebea] rounded-md transition-colors duration-200"
          >
            <span className="material-symbols-outlined">database</span>
            <span className="text-sm">Database</span>
          </a>
          <a
            href="#kanban"
            data-nav-route="kanban"
            className="flex items-center gap-3 px-3 py-2 text-[#5a6060] hover:bg-[#e8ebea] rounded-md transition-colors duration-200"
          >
            <span className="material-symbols-outlined">view_kanban</span>
            <span className="text-sm">Kanban</span>
          </a>
        </nav>

        <div className="mt-auto pt-4 space-y-1">
          <a
            href="#settings"
            data-nav-route="settings"
            className="flex items-center gap-3 px-3 py-2 text-[#5a6060] hover:bg-[#e8ebea] rounded-md transition-colors duration-200"
          >
            <span className="material-symbols-outlined">settings</span>
            <span className="text-sm">Settings</span>
          </a>
          <a
            href="#profile"
            data-nav-route="profile"
            className="flex items-center gap-3 px-3 py-2 text-[#5a6060] hover:bg-[#e8ebea] rounded-md transition-colors duration-200"
          >
            <span className="material-symbols-outlined">account_circle</span>
            <span className="text-sm">Profile</span>
          </a>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-grow flex flex-col overflow-y-auto bg-surface">
        <header className="sticky top-0 w-full z-40 bg-[#f9f9f8]/70 dark:bg-stone-950/70 backdrop-blur-xl flex justify-between items-center px-6 h-14">
          <div className="flex items-center gap-4">
            {/* Mobile hamburger */}
            <button
              className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg hover:bg-[#e8ebea] dark:hover:bg-stone-800 transition-colors"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>

            <div id="breadcrumb" className="flex items-center gap-2 text-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-sm">home</span>
              <span>/</span>
              <span
                className="text-[#2d3433] dark:text-stone-100 font-bold"
                id="breadcrumb-current"
              >
                {breadcrumb}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>
                {theme === 'dark' ? 'light_mode' : 'dark_mode'}
              </span>
            </button>

            {/* Notification Bell */}
            <div id="notif-area" className="relative">
              <button
                className="theme-toggle"
                onClick={() => setNotifOpen((v) => !v)}
                title="Notifications"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>
                  notifications
                </span>
              </button>

              {notifOpen && (
                <div className="notification-dropdown">
                  <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--surface-container-high, #e4e9e8)' }}>
                    <h4 className="text-sm font-bold text-on-surface">Recent Activity</h4>
                  </div>
                  <div className="py-2">
                    {recentActivity.length === 0 ? (
                      <div className="px-4 py-6 text-center">
                        <span className="material-symbols-outlined text-on-surface-variant/30" style={{ fontSize: '2rem' }}>
                          notifications_off
                        </span>
                        <p className="text-xs text-on-surface-variant mt-2">No recent activity</p>
                      </div>
                    ) : (
                      recentActivity.map((page) => (
                        <button
                          key={page.id}
                          className="w-full text-left px-4 py-2.5 hover:bg-surface-container-low flex items-center gap-3 transition-colors"
                          onClick={() => {
                            window.location.hash = `editor/${page.id}`;
                            setNotifOpen(false);
                          }}
                        >
                          <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center flex-shrink-0">
                            <span className="material-symbols-outlined text-sm text-on-surface-variant">edit_note</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-on-surface truncate">
                              {page.title || 'Untitled'}
                            </p>
                            <p className="text-[11px] text-on-surface-variant">
                              Updated {timeAgoShort(page.updated_at)}
                            </p>
                          </div>
                          <span className="text-lg">{page.icon || '📄'}</span>
                        </button>
                      ))
                    )}
                  </div>
                  {recentActivity.length > 0 && (
                    <div className="px-4 py-2 border-t" style={{ borderColor: 'var(--surface-container-high, #e4e9e8)' }}>
                      <button
                        className="text-xs font-semibold text-primary hover:underline w-full text-center"
                        onClick={() => {
                          window.location.hash = 'notes';
                          setNotifOpen(false);
                        }}
                      >
                        View all pages
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* User Avatar */}
            <div
              id="header-avatar"
              className="w-8 h-8 rounded-full overflow-hidden bg-surface-container-highest cursor-pointer border border-outline-variant/10"
              onClick={() => (window.location.hash = 'profile')}
              role="button"
              tabIndex={0}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs font-bold text-on-surface-variant">
                  {userInitials}
                </div>
              )}
            </div>
          </div>
        </header>

        <div id="page-content" className="flex-1">
          {isBootstrapping ? (
            <div className="flex items-center justify-center h-[60vh]">
              <div className="text-center">
                <div className="loading-spinner mx-auto mb-4"></div>
                <p className="text-sm text-on-surface-variant">Loading Motion...</p>
              </div>
            </div>
          ) : (
            <LegacyRenderer renderer={renderer} routeKey={routeKey} route={route} />
          )}
        </div>
      </main>

      {/* Toast */}
      {toast ? (
        <div className={`toast toast-${toast.type || 'success'}`}>{toast.message}</div>
      ) : null}

      {/* New Page Modal */}
      <PromptDialog
        isOpen={newPageModalOpen}
        onClose={() => setNewPageModalOpen(false)}
        onSubmit={handleCreatePage}
        title="Create New Page"
        placeholder="Page title..."
        submitText="Create"
        defaultValue=""
      />
    </div>
  );
}
