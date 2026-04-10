// ============================================
// MOTION — Client-Side Router (Hash-Based)
// ============================================

export class Router {
  constructor() {
    this.routes = {};
    this.currentRoute = null;
    this.beforeNavigate = null;

    window.addEventListener('hashchange', () => this.handleRoute());
  }

  /**
   * Register a route
   * @param {string} path - Route path (e.g. 'dashboard', 'kanban')
   * @param {function} handler - Async function that returns HTML string or renders to container
   */
  addRoute(path, handler) {
    this.routes[path] = handler;
    return this;
  }

  /**
   * Set a guard function that runs before each navigation
   * @param {function} fn - Returns true to continue, false to block
   */
  setGuard(fn) {
    this.beforeNavigate = fn;
    return this;
  }

  /**
   * Navigate to a route
   * @param {string} path 
   */
  navigate(path) {
    window.location.hash = path;
  }

  /**
   * Get the current route path
   * @returns {string}
   */
  getCurrentPath() {
    return window.location.hash.slice(1) || 'dashboard';
  }

  /**
   * Handle route change
   */
  async handleRoute() {
    const path = this.getCurrentPath();

    // Run guard
    if (this.beforeNavigate) {
      const canProceed = await this.beforeNavigate(path);
      if (!canProceed) return;
    }

    // Find matching route
    const handler = this.routes[path];
    if (handler) {
      this.currentRoute = path;
      this.updateNavActiveState(path);
      
      const container = document.getElementById('page-content');
      if (container) {
        // Show loading
        container.innerHTML = `
          <div class="loading-overlay" style="position:relative; min-height:60vh;">
            <div class="loading-spinner"></div>
          </div>
        `;
        
        try {
          await handler(container);
          container.classList.add('animate-fade-in');
          setTimeout(() => container.classList.remove('animate-fade-in'), 300);
        } catch (err) {
          console.error(`Error rendering route "${path}":`, err);
          container.innerHTML = `
            <div class="error-state" style="margin:2rem;">
              <span class="material-symbols-outlined" style="font-size:2.5rem; margin-bottom:0.5rem;">error</span>
              <h3 style="font-weight:600; margin-bottom:0.25rem;">Something went wrong</h3>
              <p style="font-size:0.875rem; opacity:0.7;">${err.message}</p>
              <button onclick="location.reload()" style="margin-top:1rem; padding:0.5rem 1.5rem; background:var(--primary); color:var(--on-primary); border:none; border-radius:var(--radius-md); cursor:pointer;">
                Reload Page
              </button>
            </div>
          `;
        }
      }
    } else {
      // 404 — redirect to dashboard
      this.navigate('dashboard');
    }
  }

  /**
   * Update sidebar nav active state
   * @param {string} activePath 
   */
  updateNavActiveState(activePath) {
    const navLinks = document.querySelectorAll('[data-nav-route]');
    navLinks.forEach(link => {
      const route = link.getAttribute('data-nav-route');
      if (route === activePath) {
        link.className = 'flex items-center gap-3 px-3 py-2 bg-white dark:bg-stone-800 text-[#2d3433] dark:text-stone-100 font-semibold rounded-md shadow-sm transition-colors duration-200';
      } else {
        link.className = 'flex items-center gap-3 px-3 py-2 text-[#5a6060] dark:text-stone-400 hover:bg-[#e8ebea] dark:hover:bg-stone-800/50 rounded-md transition-colors duration-200';
      }
    });
  }

  /**
   * Start the router (process current hash)
   */
  start() {
    this.handleRoute();
  }
}
