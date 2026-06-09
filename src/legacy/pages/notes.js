// ============================================
// MOTION — Notes Page Module (Legacy)
// ============================================

import { AppState, setBreadcrumb, showToast } from '../app.js';
import { getPages, getPage, createPage, updatePage, timeAgo } from '../../lib/queries.js';

export async function renderNotes(container) {
  setBreadcrumb('Notes');

  const workspaceId = AppState.workspace?.id;
  if (!workspaceId) {
    container.innerHTML =
      `<div class="empty-state" style="min-height:60vh;"><span class="material-symbols-outlined">folder_off</span><h3>No workspace found</h3><p>Please create a workspace first.</p></div>`;
    return;
  }

  const { data: pages, error } = await getPages(workspaceId);
  if (error) {
    container.innerHTML =
      `<div class="error-state m-8"><span class="material-symbols-outlined">error</span><h3>Failed to load pages</h3><p>${error.message}</p></div>`;
    return;
  }

  let currentPage = pages.length > 0 ? pages[0] : null;
  const userName = AppState.profile?.name || 'You';

  container.innerHTML = `
    <div class="flex flex-1 min-h-0">
      <div class="w-64 bg-surface-container-low/50 border-r border-outline-variant/10 flex flex-col overflow-hidden">
        <div class="p-4 flex items-center justify-between">
          <h3 class="font-bold text-sm text-on-surface">All Notes</h3>
          <button id="btn-new-note-page" class="p-1 hover:bg-surface-container-high rounded transition-colors">
            <span class="material-symbols-outlined text-sm">add</span>
          </button>
        </div>
        <div class="flex-1 overflow-y-auto px-2 pb-4 space-y-1" id="notes-page-list">
          ${
            pages.length === 0
              ? `<div class="text-center py-8 text-on-surface-variant/40 text-xs px-4">No pages yet. Create one to start writing.</div>`
              : pages
                  .map(
                    (page, i) => `
            <button class="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
              i === 0
                ? 'bg-white shadow-sm font-semibold text-on-surface'
                : 'text-on-surface-variant hover:bg-surface-container-low'
            }" data-page-id="${page.id}">
              <div class="flex items-center gap-2">
                <span class="text-base">${page.icon || '📄'}</span>
                <div class="min-w-0">
                  <p class="truncate font-medium">${page.title}</p>
                  <p class="text-[10px] text-on-surface-variant truncate">${timeAgo(page.updated_at)}</p>
                </div>
              </div>
            </button>
          `
                  )
                  .join('')
          }
        </div>
      </div>

      <div class="flex-1 overflow-y-auto">
        ${
          currentPage
            ? renderNoteEditor(currentPage, userName)
            : `<div class="empty-state" style="min-height:60vh;"><span class="material-symbols-outlined">edit_note</span><h3>Select or create a note</h3><p>Choose a page from the sidebar to start editing.</p></div>`
        }
      </div>
    </div>

    <div class="fixed bottom-8 left-1/2 -translate-x-1/2 glass-panel border border-outline-variant/20 rounded-full px-6 py-3 flex items-center gap-6 shadow-2xl z-50">
      <button class="flex items-center gap-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">
        <span class="material-symbols-outlined">text_fields</span>
        Type
      </button>
      <div class="w-[1px] h-4 bg-outline-variant/30"></div>
      <button class="flex items-center gap-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">
        <span class="material-symbols-outlined">format_list_bulleted</span>
        List
      </button>
      <button class="flex items-center gap-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">
        <span class="material-symbols-outlined">image</span>
        Media
      </button>
      <button class="flex items-center gap-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">
        <span class="material-symbols-outlined">add_link</span>
        Link
      </button>
    </div>
  `;

  let saveTimeout;
  function bindEditorAutosave(page) {
    const editorEl = container.querySelector('#note-content');
    const titleEl = container.querySelector('#note-title');
    if (!editorEl || !titleEl || !page?.id) return;

    function debouncedSave() {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(async () => {
        const content = { html: editorEl.innerHTML || '' };
        const title = titleEl.textContent || 'Untitled';
        const { error } = await updatePage(page.id, { title, content });
        if (error) showToast('Failed to save: ' + error.message, 'error');
      }, 1500);
    }

    editorEl.addEventListener('input', debouncedSave);
    titleEl.addEventListener('input', debouncedSave);
  }

  if (currentPage) bindEditorAutosave(currentPage);

  container.querySelector('#btn-new-note-page')?.addEventListener('click', async () => {
    const title = prompt('Note title:') || 'Untitled';
    const { error } = await createPage(workspaceId, title, 'note');
    if (error) {
      showToast('Failed to create note: ' + error.message, 'error');
      return;
    }
    showToast('Note created!', 'success');
    renderNotes(container);
  });

  container.querySelectorAll('[data-page-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pageId = btn.dataset.pageId;
      const { data: page } = await getPage(pageId);
      if (page) {
        currentPage = page;
        const editorArea = container.querySelector('.flex-1.overflow-y-auto');
        if (editorArea) {
          editorArea.innerHTML = renderNoteEditor(page, userName);
          bindEditorAutosave(page);
        }
      }
    });
  });
}

function renderNoteEditor(page, userName) {
  const contentHtml = page.content?.html || '<p class="text-on-surface-variant">Start writing here...</p>';

  return `
    <section class="flex-1 overflow-y-auto px-6 py-12 bg-surface">
      <article class="max-w-[800px] mx-auto animate-fade-in">
        <header class="mb-12 group">
          <div class="mb-6 opacity-80 hover:opacity-100 transition-opacity cursor-pointer inline-block">
            <span class="text-5xl">${page.icon || '📄'}</span>
          </div>
          <h1 id="note-title" class="text-5xl font-extrabold tracking-tighter text-on-surface mb-4 outline-none border-none focus:ring-0" contenteditable="true">
            ${page.title}
          </h1>
          <div class="flex items-center gap-6 text-[#5a6060] text-sm">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-sm">person</span>
              <span>${userName}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-sm">schedule</span>
              <span>${timeAgo(page.updated_at)}</span>
            </div>
          </div>
        </header>

        <div id="note-content" class="space-y-8 text-on-surface leading-relaxed text-lg outline-none" contenteditable="true">
          ${contentHtml}
        </div>
      </article>
    </section>
  `;
}
