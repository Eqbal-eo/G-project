// ============================================
// MOTION — Kanban Board Page Module
// ============================================

import { AppState, setBreadcrumb, showToast } from '../js/app.js';
import { getTasks, createTask, updateTask, toggleTask, timeAgo } from '../js/queries.js';

export async function renderKanban(container) {
  setBreadcrumb('Kanban');

  // Fetch all tasks
  const { data: allTasks, error } = await getTasks();
  if (error) {
    container.innerHTML = `<div class="error-state m-8"><span class="material-symbols-outlined">error</span><h3>Failed to load tasks</h3><p>${error.message}</p></div>`;
    return;
  }

  const columns = {
    todo: allTasks.filter(t => t.status === 'todo'),
    in_progress: allTasks.filter(t => t.status === 'in_progress'),
    done: allTasks.filter(t => t.status === 'done')
  };

  const columnConfig = {
    todo: { label: 'To Do', color: 'bg-outline-variant' },
    in_progress: { label: 'In Progress', color: 'bg-primary' },
    done: { label: 'Done', color: 'bg-primary-fixed-dim' }
  };

  container.innerHTML = `
    <!-- Page Header -->
    <div class="px-8 pt-8 pb-4">
      <div class="flex items-end justify-between">
        <div>
          <h2 class="text-4xl font-extrabold tracking-tight text-on-surface mb-2">Motion</h2>
          <p class="text-on-surface-variant max-w-lg">Manage project flow and tasks within your workspace.</p>
        </div>
        <button id="btn-add-column" class="flex items-center gap-2 px-4 py-2 bg-surface-container-high rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container-highest transition-colors">
          <span class="material-symbols-outlined text-lg">add_column_right</span>
          Add Group
        </button>
      </div>
    </div>

    <!-- Kanban Board -->
    <div class="flex-1 overflow-x-auto px-8 pb-8">
      <div class="flex gap-6 h-full min-w-max py-4" id="kanban-columns">
        ${Object.entries(columns).map(([status, tasks]) => `
          <div class="w-80 flex flex-col h-full bg-surface-container-low/50 rounded-xl p-3" data-column="${status}">
            <!-- Column Header -->
            <div class="flex items-center justify-between mb-4 px-1">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full ${columnConfig[status].color}"></span>
                <h3 class="font-bold text-sm uppercase tracking-widest text-on-surface-variant">${columnConfig[status].label}</h3>
                <span class="bg-surface-container-high text-[10px] px-1.5 py-0.5 rounded font-bold" data-count="${status}">${tasks.length}</span>
              </div>
              <button class="material-symbols-outlined text-lg text-on-surface-variant hover:text-on-surface">more_horiz</button>
            </div>

            <!-- Cards -->
            <div class="flex-1 space-y-3 overflow-y-auto pr-1" data-cards="${status}">
              ${tasks.length === 0 ? `
                <div class="text-center py-8 text-on-surface-variant/40 text-xs">No tasks here yet</div>
              ` : tasks.map(task => renderTaskCard(task)).join('')}
            </div>

            <!-- Add Task Button -->
            <button class="mt-3 flex items-center justify-center gap-2 py-2 text-on-surface-variant/60 hover:text-on-surface text-xs font-semibold border-2 border-dashed border-outline-variant/10 rounded-lg transition-colors btn-add-task" data-status="${status}">
              <span class="material-symbols-outlined text-sm">add</span>
              New Task
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Bind add task buttons
  container.querySelectorAll('.btn-add-task').forEach(btn => {
    btn.addEventListener('click', async () => {
      const status = btn.dataset.status;
      const title = prompt('Task title:');
      if (!title) return;

      const { data, error } = await createTask(title, { status });
      if (error) {
        showToast('Failed to create task: ' + error.message, 'error');
        return;
      }
      showToast('Task created!', 'success');
      renderKanban(container); // Re-render
    });
  });

  // Bind task toggle
  container.querySelectorAll('.task-toggle').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.taskId;
      const completed = btn.dataset.completed === 'true';
      await toggleTask(taskId, !completed);
      renderKanban(container);
    });
  });

  // Bind status change buttons
  container.querySelectorAll('.task-move').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.taskId;
      const newStatus = btn.dataset.moveTo;
      await updateTask(taskId, { status: newStatus });
      showToast('Task moved!', 'success');
      renderKanban(container);
    });
  });
}

function renderTaskCard(task) {
  const priorityColors = {
    urgent: 'bg-error text-on-error',
    high: 'bg-error-container text-on-error-container',
    medium: 'bg-tertiary-container text-on-tertiary-container',
    low: 'bg-surface-container-highest text-on-surface-variant'
  };

  const tagBadge = task.tags?.length > 0
    ? `<span class="text-[10px] px-2 py-0.5 rounded ${priorityColors[task.priority] || priorityColors.medium} font-semibold uppercase tracking-wider">${task.tags[0]}</span>`
    : task.priority !== 'medium'
      ? `<span class="text-[10px] px-2 py-0.5 rounded ${priorityColors[task.priority]} font-semibold uppercase tracking-wider">${task.priority}</span>`
      : '';

  const isDone = task.status === 'done';
  const nextStatus = task.status === 'todo' ? 'in_progress' : task.status === 'in_progress' ? 'done' : 'todo';
  const nextLabel = task.status === 'todo' ? 'Start' : task.status === 'in_progress' ? 'Complete' : 'Reopen';

  return `
    <div class="group relative bg-surface-container-lowest p-4 rounded-lg shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] border border-transparent hover:border-outline-variant/10 transition-all ${isDone ? 'opacity-60 hover:opacity-100' : ''}">
      <div class="absolute top-4 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
        <button class="task-move text-[10px] font-semibold px-2 py-0.5 bg-surface-container-high rounded hover:bg-primary hover:text-on-primary transition-colors" data-task-id="${task.id}" data-move-to="${nextStatus}">${nextLabel}</button>
      </div>
      ${tagBadge ? `<div class="flex flex-wrap gap-1.5 mb-3">${tagBadge}</div>` : ''}
      <h4 class="text-sm font-semibold text-on-surface leading-snug mb-3 ${isDone ? 'line-through decoration-on-surface-variant/30' : ''}">${task.title}</h4>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          ${task.assignee?.avatar_url
            ? `<img class="w-6 h-6 rounded-full border-2 border-surface-container-lowest" src="${task.assignee.avatar_url}" alt="${task.assignee.name}" />`
            : task.assignee?.name
              ? `<div class="w-6 h-6 rounded-full bg-secondary-fixed flex items-center justify-center text-[10px] font-bold">${task.assignee.name.split(' ').map(w=>w[0]).join('').toUpperCase()}</div>`
              : ''
          }
        </div>
        ${isDone
          ? '<span class="material-symbols-outlined text-primary-fixed-dim text-lg">check_circle</span>'
          : task.due_date
            ? `<span class="text-[10px] font-bold text-on-surface-variant">${new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>`
            : ''
        }
      </div>
    </div>
  `;
}
