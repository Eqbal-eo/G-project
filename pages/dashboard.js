// ============================================
// MOTION — Dashboard Page Module
// ============================================

import { AppState, setBreadcrumb, showToast } from '../js/app.js';
import { getRecentPages, getTasks, getTaskCounts, toggleTask, timeAgo } from '../js/queries.js';

export async function renderDashboard(container) {
  setBreadcrumb('Dashboard');

  // Fetch data in parallel
  const [pagesResult, tasksResult, countsResult] = await Promise.all([
    getRecentPages(4),
    getTasks({ limit: 5 }),
    getTaskCounts()
  ]);

  const pages = pagesResult.data || [];
  const tasks = tasksResult.data || [];
  const counts = countsResult.data || { total: 0, todo: 0, in_progress: 0, done: 0 };
  const userName = AppState.profile?.name || AppState.user?.email?.split('@')[0] || 'there';
  const pending = counts.todo + counts.in_progress;

  container.innerHTML = `
    <div class="p-8 max-w-7xl mx-auto w-full">
      <!-- Welcome Section -->
      <section class="mb-12">
        <h2 class="text-3xl font-extrabold tracking-tighter text-[#2d3433] mb-2 font-headline">Welcome back, ${userName}.</h2>
        <p class="text-on-surface-variant body-lg">Your workspace is harmonized and ready for your next move.</p>
      </section>

      <!-- Bento Grid Layout -->
      <div class="grid grid-cols-1 md:grid-cols-12 gap-6">

        <!-- Getting Started Checklist -->
        <div class="md:col-span-4 bg-surface-container-lowest rounded-xl p-6 shadow-sm flex flex-col">
          <div class="flex items-center gap-2 mb-6">
            <span class="material-symbols-outlined text-primary">task_alt</span>
            <h3 class="font-bold tracking-tight text-on-surface">Getting Started</h3>
          </div>
          <ul class="space-y-4" id="checklist">
            <li class="flex items-start gap-3 group cursor-pointer">
              <div class="w-5 h-5 rounded border-2 border-primary/20 group-hover:border-primary flex items-center justify-center mt-0.5"></div>
              <div>
                <p class="text-sm font-medium text-on-surface">Create your first page</p>
                <p class="text-xs text-on-surface-variant">Organize ideas into meaningful documents.</p>
              </div>
            </li>
            <li class="flex items-start gap-3 group cursor-pointer">
              <div class="w-5 h-5 rounded bg-primary flex items-center justify-center mt-0.5">
                <span class="material-symbols-outlined text-white text-[12px] font-bold">check</span>
              </div>
              <div>
                <p class="text-sm font-medium text-on-surface-variant line-through">Setup workspace identity</p>
                <p class="text-xs text-on-surface-variant">Workspace created automatically.</p>
              </div>
            </li>
            <li class="flex items-start gap-3 group cursor-pointer">
              <div class="w-5 h-5 rounded border-2 border-primary/20 group-hover:border-primary flex items-center justify-center mt-0.5"></div>
              <div>
                <p class="text-sm font-medium text-on-surface">Add your first task</p>
                <p class="text-xs text-on-surface-variant">Start tracking your workflow.</p>
              </div>
            </li>
          </ul>
          <div class="mt-auto pt-8">
            <div class="w-full bg-surface-container rounded-full h-1.5 mb-2">
              <div class="bg-primary h-1.5 rounded-full" style="width: 33%"></div>
            </div>
            <p class="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">33% PROGRESS</p>
          </div>
        </div>

        <!-- Recent Pages -->
        <div class="md:col-span-8">
          <div class="flex justify-between items-end mb-4">
            <h3 class="font-bold tracking-tight text-on-surface px-2">Recent Pages</h3>
            <button class="text-xs font-bold text-primary hover:underline" onclick="window.location.hash='notes'">View all</button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4" id="recent-pages-grid">
            ${pages.length === 0 ? `
              <div class="col-span-2 empty-state">
                <span class="material-symbols-outlined">description</span>
                <h3>No pages yet</h3>
                <p>Create your first page to get started.</p>
              </div>
            ` : pages.map(page => `
              <div class="group bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer" onclick="window.location.hash='editor'">
                <div class="h-32 bg-surface-container overflow-hidden flex items-center justify-center">
                  <span class="text-4xl">${page.icon || '📄'}</span>
                </div>
                <div class="p-4">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-[10px] font-bold text-tertiary uppercase tracking-wider">${page.page_type || 'Note'}</span>
                    <span class="material-symbols-outlined text-sm text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity">more_horiz</span>
                  </div>
                  <h4 class="font-semibold text-on-surface mb-1">${page.title}</h4>
                  <p class="text-xs text-on-surface-variant">${timeAgo(page.updated_at)}</p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Active Tasks Summary -->
        <div class="md:col-span-12 bg-surface-container-low/50 rounded-xl p-8 border border-outline-variant/10">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h3 class="text-xl font-bold tracking-tight text-on-surface mb-1">Active Tasks</h3>
              <p class="text-sm text-on-surface-variant">
                ${pending > 0 ? `You have ${pending} task${pending > 1 ? 's' : ''} requiring attention.` : 'All caught up! No pending tasks.'}
              </p>
            </div>
            <div class="flex gap-4">
              <div class="flex flex-col items-center justify-center p-4 bg-surface-container-lowest rounded-lg w-24">
                <span class="text-2xl font-bold text-on-surface">${String(counts.total).padStart(2, '0')}</span>
                <span class="text-[10px] font-bold text-on-surface-variant uppercase">Total</span>
              </div>
              <div class="flex flex-col items-center justify-center p-4 bg-primary text-on-primary rounded-lg w-24 shadow-lg shadow-primary/20">
                <span class="text-2xl font-bold">${String(pending).padStart(2, '0')}</span>
                <span class="text-[10px] font-bold uppercase">Pending</span>
              </div>
              <div class="flex flex-col items-center justify-center p-4 bg-surface-container-lowest rounded-lg w-24">
                <span class="text-2xl font-bold text-tertiary">${String(counts.done).padStart(2, '0')}</span>
                <span class="text-[10px] font-bold text-on-surface-variant uppercase">Done</span>
              </div>
            </div>
          </div>

          <!-- Task List -->
          <div class="mt-8 space-y-3" id="task-list">
            ${tasks.length === 0 ? `
              <div class="text-center py-6 text-on-surface-variant text-sm">No tasks yet. Head to the Kanban board to create some!</div>
            ` : tasks.slice(0, 4).map(task => `
              <div class="flex items-center justify-between p-3 bg-white/40 hover:bg-white rounded-lg transition-colors cursor-pointer group" data-task-id="${task.id}">
                <div class="flex items-center gap-4">
                  <div class="w-2 h-2 rounded-full ${task.priority === 'urgent' || task.priority === 'high' ? 'bg-error' : 'bg-primary'}"></div>
                  <span class="text-sm font-medium text-on-surface ${task.completed ? 'line-through opacity-50' : ''}">${task.title}</span>
                </div>
                <div class="flex items-center gap-4">
                  <span class="text-xs font-bold text-on-surface-variant">${task.due_date ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : task.status?.toUpperCase().replace('_', ' ')}</span>
                  <span class="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">chevron_right</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}
