// ============================================
// MOTION — Block Editor Page Module (Legacy)
// ============================================

import { AppState, setBreadcrumb } from '../app.js';
import { getRecentPages, getPage, updatePage, timeAgo } from '../../lib/queries.js';

export async function renderEditor(container, route) {
  setBreadcrumb('Editor');

  const pageIdFromRoute = route?.segments?.[0] || null;
  let page = null;

  if (pageIdFromRoute) {
    const { data } = await getPage(pageIdFromRoute);
    page = data || null;
  }

  if (!page) {
    const { data: pages } = await getRecentPages(1);
    page = pages?.[0] || null;
  }
  const userName = AppState.profile?.name || 'You';

  if (!page) {
    container.innerHTML = `
      <div class="empty-state" style="min-height:70vh;">
        <span class="material-symbols-outlined">edit_document</span>
        <h3>No pages to edit</h3>
        <p>Create a new page from the sidebar to start writing.</p>
      </div>
    `;
    return;
  }

  const contentHtml = page.content?.html || '';

  container.innerHTML = `
    <div class="flex-1 bg-surface overflow-y-auto relative">
      <div class="max-w-3xl mx-auto pt-12 pb-48 px-12">
        ${
          page.cover_url
            ? `
          <div class="w-full h-48 mb-12 rounded-xl overflow-hidden group relative">
            <img class="w-full h-full object-cover" src="${page.cover_url}" alt="Cover" />
            <div class="absolute inset-0 bg-black/5 group-hover:bg-black/0 transition-all"></div>
            <button class="absolute bottom-4 right-4 bg-surface-container-lowest/90 backdrop-blur px-3 py-1 rounded-md text-[11px] font-medium text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity">Change cover</button>
          </div>
        `
            : `
          <div class="mb-4 opacity-0 hover:opacity-60 transition-opacity">
            <button class="text-xs text-on-surface-variant flex items-center gap-1">
              <span class="material-symbols-outlined text-sm">add_photo_alternate</span>
              Add cover
            </button>
          </div>
        `
        }

        <div class="mb-10 group relative">
          <h1 id="editor-title" class="text-4xl font-extrabold tracking-tight text-[#2d3433] mb-2 outline-none focus:ring-0" contenteditable="true">${
            page.title
          }</h1>
          <div class="flex gap-4 text-sm text-on-surface-variant/60">
            <span class="flex items-center gap-1">
              <span class="material-symbols-outlined text-[14px]">face</span>
              Created by ${userName}
            </span>
            <span class="flex items-center gap-1">
              <span class="material-symbols-outlined text-[14px]">history</span>
              ${timeAgo(page.updated_at)}
            </span>
          </div>
        </div>

        <div id="editor-blocks" class="space-y-4">
          ${
            contentHtml
              ? `
            <div class="flex items-start group relative">
              <div class="absolute -left-12 top-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button class="w-6 h-6 flex items-center justify-center hover:bg-surface-container rounded text-on-surface-variant">
                  <span class="material-symbols-outlined text-[18px]">add</span>
                </button>
                <div class="w-6 h-6 flex items-center justify-center cursor-grab text-on-surface-variant/40">
                  <span class="material-symbols-outlined text-[18px]">drag_indicator</span>
                </div>
              </div>
              <div class="w-full outline-none text-[16px] leading-relaxed text-on-surface/80" contenteditable="true">${contentHtml}</div>
            </div>
          `
              : ''
          }
        </div>

        <div id="editor-empty-area" class="mt-8 text-on-surface-variant/20 hover:text-on-surface-variant/40 transition-colors cursor-text text-sm min-h-[200px]" contenteditable="true">
          ${!contentHtml ? 'Click here to start writing...' : ''}
        </div>
      </div>
    </div>
  `;

  const titleEl = container.querySelector('#editor-title');
  let saveTimeout;

  function debouncedSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      const title = titleEl?.textContent || 'Untitled';
      const blocksEl = container.querySelector('#editor-blocks');
      const emptyEl = container.querySelector('#editor-empty-area');
      const html = (blocksEl?.innerHTML || '') + (emptyEl?.innerHTML || '');
      await updatePage(page.id, { title, content: { html } });
    }, 2000);
  }

  if (titleEl) titleEl.addEventListener('input', debouncedSave);
  container.querySelector('#editor-blocks')?.addEventListener('input', debouncedSave);
  container.querySelector('#editor-empty-area')?.addEventListener('input', debouncedSave);
}
