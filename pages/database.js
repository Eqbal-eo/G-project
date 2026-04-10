// ============================================
// MOTION — Database Table Page Module
// ============================================

import { AppState, setBreadcrumb, showToast } from '../js/app.js';
import { getPages, createPage, deletePage, timeAgo } from '../js/queries.js';

export async function renderDatabase(container) {
  setBreadcrumb('Database');

  const workspaceId = AppState.workspace?.id;
  if (!workspaceId) {
    container.innerHTML = `<div class="empty-state" style="min-height:60vh;"><span class="material-symbols-outlined">folder_off</span><h3>No workspace</h3><p>Create a workspace first.</p></div>`;
    return;
  }

  const { data: pages, error } = await getPages(workspaceId);
  if (error) {
    container.innerHTML = `<div class="error-state m-8"><span class="material-symbols-outlined">error</span><h3>Failed to load data</h3><p>${error.message}</p></div>`;
    return;
  }

  const userName = AppState.profile?.name || 'You';
  const userInitials = userName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  container.innerHTML = `
    <div class="flex-1 p-8 max-w-7xl mx-auto w-full">
      <!-- Page Header -->
      <div class="mb-8">
        <div class="flex justify-between items-end mb-6">
          <div>
            <h2 class="text-3xl font-extrabold tracking-tight text-on-surface mb-2">Project Database</h2>
            <p class="text-on-surface-variant">Manage and curate your organizational assets across all active workstreams.</p>
          </div>
          <button id="btn-new-row" class="px-5 py-2.5 bg-primary text-on-primary rounded-lg font-semibold flex items-center gap-2 transition-transform active:scale-95">
            <span class="material-symbols-outlined">add</span>
            New Row
          </button>
        </div>
        <!-- Toolbar -->
        <div class="flex items-center justify-between gap-4 p-2 bg-surface-container-low rounded-xl">
          <div class="flex items-center gap-2">
            <button class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors">
              <span class="material-symbols-outlined">filter_list</span>
              Filter
            </button>
            <button class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors">
              <span class="material-symbols-outlined">sort</span>
              Sort
            </button>
            <button class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors">
              <span class="material-symbols-outlined">search</span>
              Find
            </button>
          </div>
          <button class="p-1.5 text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors">
            <span class="material-symbols-outlined">more_horiz</span>
          </button>
        </div>
      </div>

      <!-- Table -->
      <div class="bg-surface-container-lowest rounded-xl overflow-hidden">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-surface-container-low/50">
              <th class="px-6 py-4 text-xs font-bold uppercase tracking-widest text-on-surface-variant border-none">Name</th>
              <th class="px-6 py-4 text-xs font-bold uppercase tracking-widest text-on-surface-variant border-none">Type</th>
              <th class="px-6 py-4 text-xs font-bold uppercase tracking-widest text-on-surface-variant border-none">Updated</th>
              <th class="px-6 py-4 text-xs font-bold uppercase tracking-widest text-on-surface-variant border-none">Owner</th>
              <th class="px-6 py-4 w-10"></th>
            </tr>
          </thead>
          <tbody id="db-table-body">
            ${pages.length === 0 ? `
              <tr>
                <td colspan="5" class="px-6 py-12 text-center text-on-surface-variant text-sm">
                  <div class="empty-state">
                    <span class="material-symbols-outlined">table_chart</span>
                    <h3>No data yet</h3>
                    <p>Add your first row to start building your database.</p>
                  </div>
                </td>
              </tr>
            ` : pages.map(page => `
              <tr class="hover:bg-[#f2f4f3] transition-colors group cursor-pointer" data-page-id="${page.id}">
                <td class="px-6 py-4">
                  <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-on-surface-variant">description</span>
                    <span class="font-semibold text-on-surface">${page.title}</span>
                  </div>
                </td>
                <td class="px-6 py-4">
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-tertiary-container text-on-tertiary-container">
                    ${page.page_type || 'Note'}
                  </span>
                </td>
                <td class="px-6 py-4 text-sm text-on-surface-variant">${timeAgo(page.updated_at)}</td>
                <td class="px-6 py-4">
                  <div class="flex items-center gap-2">
                    <div class="w-6 h-6 rounded-full bg-secondary-fixed flex items-center justify-center text-[10px] font-bold">${userInitials}</div>
                    <span class="text-sm text-on-surface">${userName}</span>
                  </div>
                </td>
                <td class="px-6 py-4 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                  <span class="material-symbols-outlined text-outline-variant cursor-pointer hover:text-error btn-delete-page" data-page-id="${page.id}">delete</span>
                </td>
              </tr>
            `).join('')}
            <!-- Add Row -->
            <tr class="hover:bg-surface-container-low/30 transition-colors">
              <td class="px-6 py-4" colspan="5">
                <button id="btn-inline-new" class="flex items-center gap-2 text-on-surface-variant hover:text-on-surface text-sm transition-colors">
                  <span class="material-symbols-outlined text-sm">add</span>
                  New
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="mt-6 flex items-center justify-between text-sm text-on-surface-variant">
        <div>Showing ${pages.length} item${pages.length !== 1 ? 's' : ''}</div>
      </div>
    </div>
  `;

  // Bind new row
  const addHandler = async () => {
    const title = prompt('Page title:');
    if (!title) return;
    const { error } = await createPage(workspaceId, title);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    showToast('Row added!', 'success');
    renderDatabase(container);
  };

  document.getElementById('btn-new-row')?.addEventListener('click', addHandler);
  document.getElementById('btn-inline-new')?.addEventListener('click', addHandler);

  // Bind delete
  container.querySelectorAll('.btn-delete-page').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this page?')) return;
      const { error } = await deletePage(btn.dataset.pageId);
      if (error) { showToast('Failed: ' + error.message, 'error'); return; }
      showToast('Deleted.', 'success');
      renderDatabase(container);
    });
  });

  // Bind row clicks to navigate to editor
  container.querySelectorAll('[data-page-id]').forEach(tr => {
    if (tr.tagName === 'TR') {
      tr.addEventListener('click', () => { window.location.hash = 'editor'; });
    }
  });
}
