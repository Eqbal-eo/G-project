// ============================================
// MOTION — Project view (Overview · Plan · Teams · Check-ins · Decisions · Tasks · Library)
// ============================================
import { iconSvg, pageIconSvg } from '../../lib/icons.js';
import { AppState, setBreadcrumb, showToast } from '../app.js';
import { getPages, getTasks, getWorkspaceMembers, createTask, toggleTask, timeAgo } from '../../lib/queries.js';
import { supabase } from '../../lib/supabase.js';
import { escapeHtml } from '../../lib/sanitize.js';
import { isProject, projectPageIds, tasksForProject, projectProgress, isOverdue, sortTasksForFocus } from '../../lib/projects.js';
import { startNewPageIn } from '../../lib/projectActions.js';
import { requestNewTask, openTaskDetails } from '../../lib/taskDetails.js';
import { renderKanban } from './kanban.js';
import { renderTeamsTab } from './projectTeams.js';
import { renderCheckinsTab } from './projectCheckins.js';
import { getCheckins, weekStart, expectedPeople, blockersOf } from '../../lib/checkins.js';
import { getProjectTeams, teamStats, TEAM_COLORS, workspaceRole } from '../../lib/teams.js';
import { renderMilestonesCard, openMeetingAssistant, renderDecisionsTab, renderResources, renderWorkload } from './projectTools.js';
import { LESSON_SETUP_MESSAGE, isMissingLessonsTable, listProjectLessons, createLesson, findLesson, parseYouTubeId, formatTime } from '../../lib/lessons.js';
import { generateProjectReport } from '../../lib/projectReport.js';
import { parseAgenda } from '../../lib/meetingAI.js';
import { MEETING_SETUP_MESSAGE, isMissingMeetingsTable, listProjectMeetings, createMeeting } from '../../lib/meetings.js';
import { requestForm } from '../../lib/dialogs.js';
import { loaderHtml } from '../../lib/loader.js';

// Six main tabs. Team and Library have sections; their own addresses
// (#project/<id>/checkins, /meetings and /lessons) open the right section.
const TABS = [
  { id: 'overview', label: 'Overview', icon: 'layout-dashboard', hint: 'What’s next, what’s late, and the progress report' },
  { id: 'plan', label: 'Plan & discussion', icon: 'messages-square', hint: 'The project plan page, with comments from the team' },
  { id: 'tasks', label: 'Tasks', icon: 'square-kanban', hint: 'All tasks in this project as a board, list, calendar or timeline' },
  { id: 'teams', label: 'Team', icon: 'users', hint: 'Teams with leaders, everyone’s workload, and weekly check-ins' },
  { id: 'decisions', label: 'Decisions', icon: 'vote', hint: 'Quick polls and a log of what the team decided and why' },
  { id: 'pages', label: 'Library', icon: 'library', hint: 'Pages, links, files and YouTube lessons for this project' }
];
const SECTIONS = {
  teams: [
    { id: 'teams', label: 'Teams & workload', icon: 'users', hint: 'Split the work into teams, each with a leader and progress' },
    { id: 'checkins', label: 'Weekly check-ins', icon: 'calendar-days', hint: 'Weekly: what everyone did, what’s next, what’s blocking them' },
    { id: 'meetings', label: 'Live meetings', icon: 'users-round', hint: 'Run a meeting together: shared agenda timer, live notes, and minutes that become tasks' }
  ],
  pages: [
    { id: 'pages', label: 'Pages & files', icon: 'file-text', hint: 'Pages, links, files and notes for this project' },
    { id: 'lessons', label: 'YouTube lessons', icon: 'monitor-play', hint: 'YouTube lectures turned into timestamped notes you can search and ask about' }
  ]
};
const PARENT_TAB = { checkins: 'teams', meetings: 'teams', lessons: 'pages' };

function tabHref(projectId, tab) {
  if (tab === 'plan') return `#editor/${projectId}`;
  return tab === 'overview' ? `#project/${projectId}` : `#project/${projectId}/${tab}`;
}

function avatar(member, size = 28) {
  const user = member?.user || {};
  const name = user.name || user.email || 'Member';
  const url = /^https?:\/\//i.test(user.avatar_url || '') ? user.avatar_url : '';
  return url
    ? `<img class="project-avatar" style="width:${size}px;height:${size}px" src="${escapeHtml(url)}" alt="${escapeHtml(name)}" title="${escapeHtml(name)}" />`
    : `<span class="project-avatar" style="width:${size}px;height:${size}px" title="${escapeHtml(name)}">${escapeHtml(name.slice(0, 1).toUpperCase())}</span>`;
}

// Shared header used by the project view and by pages inside a project.
export function renderProjectBar({ project, activeTab, progress = null, members = [], showSections = true }) {
  const mainTab = PARENT_TAB[activeTab] || activeTab;
  return `
    <div class="project-bar">
      <div class="project-bar-top">
        <a class="project-bar-title" href="#project/${escapeHtml(project.id)}">
          <span class="project-bar-icon">${pageIconSvg(project.icon, { fallback: 'folder' })}</span>
          <span><small>PROJECT</small><strong>${escapeHtml(project.title || 'Untitled project')}</strong></span>
        </a>
        ${progress ? `<div class="project-progress" title="${progress.done} of ${progress.total} tasks done">
          <div class="project-progress-track"><span style="width:${progress.percent}%"></span></div>
          <small>${progress.total ? `${progress.done}/${progress.total} tasks done` : 'No tasks yet'}</small>
        </div>` : ''}
        ${members.length ? `<div class="project-members">${members.slice(0, 5).map((member) => avatar(member, 26)).join('')}${members.length > 5 ? `<span class="project-more">+${members.length - 5}</span>` : ''}<a href="#settings?section=team" class="project-invite" title="Invite teammates">${iconSvg('user-plus')}</a></div>` : ''}
      </div>
      <nav class="project-tabs" aria-label="Project sections">
        ${TABS.map((tab) => `<a href="${tabHref(project.id, tab.id)}" title="${tab.hint}" class="${tab.id === mainTab ? 'is-active' : ''}" ${tab.id === mainTab ? 'aria-current="page"' : ''}>${iconSvg(tab.icon)}${tab.label}</a>`).join('')}
      </nav>
      ${showSections && SECTIONS[mainTab] ? `<nav class="project-subtabs" aria-label="${mainTab === 'teams' ? 'Team' : 'Library'} sections">
        ${SECTIONS[mainTab].map((section) => `<a href="${tabHref(project.id, section.id)}" title="${section.hint}" class="${section.id === activeTab ? 'is-active' : ''}" ${section.id === activeTab ? 'aria-current="page"' : ''}>${iconSvg(section.icon)}${section.label}</a>`).join('')}
      </nav>` : ''}
    </div>`;
}

// On narrow screens the tab bar scrolls sideways; keep the current tab in view.
export function revealActiveTab(root) {
  for (const bar of root?.querySelectorAll?.('.project-tabs, .project-subtabs') || []) {
    const active = bar.querySelector('a.is-active');
    if (active && bar.scrollWidth > bar.clientWidth) bar.scrollLeft = Math.max(0, active.offsetLeft - bar.offsetLeft - 16);
  }
}

export async function renderProject(container, route) {
  await renderProjectView(container, route);
  revealActiveTab(container);
}

async function renderProjectView(container, route) {
  const projectId = route?.segments?.[0];
  const tab = ['tasks', 'pages', 'teams', 'checkins', 'meetings', 'decisions', 'lessons'].includes(route?.segments?.[1]) ? route.segments[1] : 'overview';
  const workspaceId = AppState.workspace?.id;

  const [pagesResult, tasksResult, membersResult, teamsResult] = await Promise.all([
    workspaceId ? getPages(workspaceId) : Promise.resolve({ data: [] }),
    getTasks({ workspaceId }),
    workspaceId ? getWorkspaceMembers(workspaceId) : Promise.resolve({ data: [] }),
    projectId ? getProjectTeams(projectId) : Promise.resolve({ data: [] })
  ]);
  const teams = teamsResult.data || [];
  const pages = pagesResult.data || [];
  const project = pages.find((page) => page.id === projectId);
  if (!project || !isProject(project)) {
    setBreadcrumb('Project not found');
    container.innerHTML = `<div class="project-empty-state">${iconSvg('folder-x')}<h2>Project not found</h2><p>It may have been archived, or it belongs to another team.</p><a href="#dashboard">Go home</a></div>`;
    return;
  }
  setBreadcrumb(project.title || 'Untitled project');

  const members = membersResult.data || [];
  const tasks = tasksForProject(tasksResult.data || [], pages, project.id);
  const progress = projectProgress(tasks);
  const bar = renderProjectBar({ project, activeTab: tab, progress, members });
  const role = workspaceRole(members, AppState.user?.id, AppState.workspace);

  if (tab === 'teams') {
    container.innerHTML = `<div class="project-view">${bar}<section class="project-section project-workload"></section><section class="project-section project-teams"></section></div>`;
    renderWorkload(container.querySelector('.project-workload'), { project, tasks, members, teams });
    if (!container.querySelector('.project-workload').innerHTML) container.querySelector('.project-workload').remove();
    renderTeamsTab(container.querySelector('.project-teams'), {
      project, teams, tasks, members, workspaceId,
      unavailable: Boolean(teamsResult.unavailable),
      refresh: () => renderProject(container, route)
    });
    return;
  }

  if (tab === 'checkins') {
    container.innerHTML = `<div class="project-view">${bar}<section class="project-section project-checkins"></section></div>`;
    await renderCheckinsTab(container.querySelector('.project-checkins'), { project, tasks, teams, members, workspaceId });
    return;
  }

  if (tab === 'meetings') {
    await renderMeetingsTab(container, { bar, project, workspaceId, role });
    return;
  }

  if (tab === 'decisions') {
    container.innerHTML = `<div class="project-view">${bar}<section class="project-section project-decisions"></section></div>`;
    await renderDecisionsTab(container.querySelector('.project-decisions'), { project, members, role, workspaceId });
    return;
  }

  if (tab === 'lessons') {
    await renderLessonsTab(container, { bar, project, workspaceId, role });
    return;
  }

  if (tab === 'tasks') {
    container.innerHTML = `<div class="project-view">${bar}<div class="project-board"></div></div>`;
    await renderKanban(container.querySelector('.project-board'), { query: route.query, scope: { projectId: project.id, project, pages } });
    return;
  }

  const ids = projectPageIds(pages, project.id);
  const projectPages = pages.filter((page) => ids.has(page.id) && page.id !== project.id);

  if (tab === 'pages') {
    const children = new Map();
    for (const page of projectPages) {
      const list = children.get(page.parent_id) || [];
      list.push(page);
      children.set(page.parent_id, list);
    }
    const renderTree = (parentId, depth) => (children.get(parentId) || [])
      .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')))
      .map((page) => `<li style="--depth:${depth}"><a href="#editor/${escapeHtml(page.id)}">${pageIconSvg(page.icon)}<strong>${escapeHtml(page.title || 'Untitled')}</strong><small>Edited ${escapeHtml(timeAgo(page.updated_at))}</small></a></li>${renderTree(page.id, depth + 1)}`)
      .join('');
    container.innerHTML = `<div class="project-view">${bar}
      <section class="project-section">
        <div class="project-section-head"><h2>Pages in this project</h2><button type="button" class="project-btn primary" data-new-page>${iconSvg('file-plus')} New page</button></div>
        ${projectPages.length ? `<ul class="project-page-tree">${renderTree(project.id, 0)}</ul>` : `<div class="project-hint">${iconSvg('file-text')}<div><strong>No pages yet</strong><p>Add pages for meeting notes, research or drafts. The project plan lives in “Plan &amp; discussion”.</p></div></div>`}
      </section>
      <section class="project-section project-resources"></section></div>`;
    container.querySelector('[data-new-page]')?.addEventListener('click', () => startNewPageIn(project.id));
    await renderResources(container.querySelector('.project-resources'), { project, role, workspaceId });
    return;
  }

  // Overview
  const openTasks = sortTasksForFocus(tasks.filter((task) => task.status !== 'done' && !task.completed));
  const overdue = openTasks.filter((task) => isOverdue(task));
  const unassigned = openTasks.filter((task) => !task.assignee_id);
  const recentPages = [...projectPages].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 5);
  // Load the discussion and this week's check-ins at the same time.
  const thisWeek = weekStart();
  const [{ data: comments }, { data: weekCheckins = [], unavailable: checkinsOff }] = await Promise.all([
    supabase
      .from('comments')
      .select('id, page_id, content, created_at, author:users(name)')
      .in('page_id', [...ids])
      .order('created_at', { ascending: false })
      .limit(5),
    getCheckins({ projectId: project.id, weeks: [thisWeek] })
  ]);
  const pageTitle = (id) => (id === project.id ? 'Project plan' : pages.find((page) => page.id === id)?.title || 'Untitled');

  const taskRow = (task) => `
    <li class="project-task ${isOverdue(task) ? 'is-overdue' : ''}">
      <button type="button" class="project-task-check" data-toggle="${escapeHtml(task.id)}" aria-label="Mark “${escapeHtml(task.title)}” as done">${iconSvg('circle')}</button>
      <button type="button" class="project-task-title" data-open="${escapeHtml(task.id)}">${escapeHtml(task.title)}</button>
      <span class="project-task-meta">${task.assignee?.name ? escapeHtml(task.assignee.name) : '<em>Unassigned</em>'}</span>
      <span class="project-task-meta ${isOverdue(task) ? 'is-overdue' : ''}">${task.due_date ? (isOverdue(task) ? 'Overdue · ' : 'Due ') + escapeHtml(task.due_date) : ''}</span>
    </li>`;

  const checkinPeople = expectedPeople(tasks, teams);
  const iCheckedIn = weekCheckins.some((checkin) => checkin.user_id === AppState.user?.id);
  const weekBlockers = blockersOf(weekCheckins);
  const checkinNote = checkinsOff ? '' : `<a class="project-checkin-pill ${!iCheckedIn && checkinPeople.has(AppState.user?.id) ? 'is-due' : ''}" href="${tabHref(project.id, 'checkins')}">
      ${iconSvg('calendar-days')}
      ${!iCheckedIn && checkinPeople.has(AppState.user?.id) ? '<strong>Your weekly check-in is due</strong>' : `<span>${weekCheckins.length}${checkinPeople.size ? `/${new Set([...checkinPeople, ...weekCheckins.map((c) => c.user_id)]).size}` : ''} checked in this week</span>`}
      ${weekBlockers.length ? `<span class="is-blocker">${iconSvg('construction')} ${weekBlockers.length} blocker${weekBlockers.length === 1 ? '' : 's'}</span>` : ''}
    </a>`;
  const reports = projectPages.filter((page) => /^Progress report/.test(page.title || '')).sort((a, b) => String(b.created_at || b.updated_at).localeCompare(String(a.created_at || a.updated_at)));
  container.innerHTML = `<div class="project-view">${bar}
    <div class="project-report-row">
      <button type="button" class="project-btn primary" data-report>${iconSvg('activity')} Progress report</button>
      <button type="button" class="project-btn" data-meeting title="An agenda built from blockers, deadlines and open polls">${iconSvg('users-round')} Plan a meeting</button>
      ${reports[0] ? `<a class="project-link" href="#editor/${escapeHtml(reports[0].id)}">Last report: ${escapeHtml(timeAgo(reports[0].created_at || reports[0].updated_at))} →</a>` : '<span class="project-report-hint">One click: a summary of progress, teams, overdue work and who did what, for your team or supervisor.</span>'}
      ${checkinNote}
    </div>
    ${overdue.length || unassigned.length ? `<div class="project-alerts">
      ${overdue.length ? `<span class="project-alert danger">${iconSvg('clock')}${overdue.length} overdue</span>` : ''}
      ${unassigned.length ? `<span class="project-alert">${iconSvg('user-x')}${unassigned.length} without an owner — assign them so nothing slips</span>` : ''}
    </div>` : ''}
    ${teams.length ? `<a class="project-teams-strip" href="${tabHref(project.id, 'teams')}" aria-label="Open teams">${teams.map((team) => {
      const stats = teamStats(team, tasks);
      return `<span class="project-team-pill" style="--team:${TEAM_COLORS[team.color] || TEAM_COLORS.blue}"><i></i><strong>${escapeHtml(team.name)}</strong><span class="project-team-pill-track"><b style="width:${stats.percent}%"></b></span><small>${stats.percent}%</small></span>`;
    }).join('')}<span class="project-link">Teams →</span></a>` : ''}
    <div class="project-grid">
      <section class="project-section">
        <div class="project-section-head"><h2>Next up</h2><div class="project-head-actions"><button type="button" class="project-btn primary" data-add-task>${iconSvg('list-plus')} Add task</button><a class="project-link" href="${tabHref(project.id, 'tasks')}">Board →</a></div></div>
        ${openTasks.length ? `<ul class="project-task-list">${openTasks.slice(0, 8).map(taskRow).join('')}</ul>` : `<div class="project-hint">${iconSvg('circle-check-big')}<div><strong>${tasks.length ? 'All tasks are done' : 'No tasks yet'}</strong><p>${tasks.length ? 'Add the next piece of work, or celebrate.' : 'Break the plan into tasks and give each one an owner.'}</p></div></div>`}
      </section>
      <div class="project-side">
        <section class="project-section project-milestones"><div class="project-section-head"><h2>Milestones</h2></div></section>
        <section class="project-section">
          <div class="project-section-head"><h2>Latest discussion</h2><a class="project-link" href="${tabHref(project.id, 'plan')}">Open →</a></div>
          ${comments?.length ? `<ul class="project-feed">${comments.map((comment) => `<li><a href="#editor/${escapeHtml(comment.page_id)}"><strong>${escapeHtml(comment.author?.name || 'Teammate')}</strong> on ${escapeHtml(pageTitle(comment.page_id))}<p>${escapeHtml(String(comment.content || '').replace(/^\[RESOLVED\] /, '').slice(0, 120))}</p><small>${escapeHtml(timeAgo(comment.created_at))}</small></a></li>`).join('')}</ul>` : `<div class="project-hint">${iconSvg('messages-square')}<div><strong>No discussion yet</strong><p>Open the plan and leave a comment. @mention a teammate to bring them in.</p></div></div>`}
        </section>
        <section class="project-section">
          <div class="project-section-head"><h2>Pages</h2><div class="project-head-actions"><button type="button" class="project-btn" data-new-page>${iconSvg('file-plus')} New</button><a class="project-link" href="${tabHref(project.id, 'pages')}">All →</a></div></div>
          <ul class="project-mini-pages">
            <li><a href="#editor/${escapeHtml(project.id)}">${iconSvg('map', 'page-icon')}<strong>Project plan</strong><small>Edited ${escapeHtml(timeAgo(project.updated_at))}</small></a></li>
            ${recentPages.map((page) => `<li><a href="#editor/${escapeHtml(page.id)}">${pageIconSvg(page.icon)}<strong>${escapeHtml(page.title || 'Untitled')}</strong><small>Edited ${escapeHtml(timeAgo(page.updated_at))}</small></a></li>`).join('')}
          </ul>
        </section>
      </div>
    </div></div>`;

  const refresh = () => renderProject(container, route);
  renderMilestonesCard(container.querySelector('.project-milestones'), { project, progress: progress.percent, role, workspaceId, refresh });
  container.querySelector('[data-meeting]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await openMeetingAssistant({ project, tasks, members, workspaceId, weekCheckins, role });
    } catch (error) {
      showToast(`Could not build the agenda: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
    }
  });
  container.querySelector('[data-report]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const values = await requestForm({
      title: 'Progress report',
      description: 'Groupify counts everything (progress, teams, overdue work, who did what) and the AI writes a short summary with next steps. The report is saved as a page in this project.',
      submitLabel: 'Generate report',
      fields: [
        { name: 'days', label: 'Period', type: 'select', value: '7', options: [{ value: '7', label: 'Last 7 days' }, { value: '14', label: 'Last 14 days' }, { value: '30', label: 'Last 30 days' }] },
        { name: 'ai', label: 'Summary', type: 'select', value: 'yes', options: [{ value: 'yes', label: 'Include AI summary and next steps' }, { value: 'no', label: 'Numbers only (no AI)' }] }
      ]
    });
    if (!values) return;
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `${loaderHtml(16, 'Generating report')} Writing report…`;
    try {
      const { page, aiError } = await generateProjectReport({
        workspaceId, project, tasks, teams, members,
        pageIds: [...ids],
        days: Number(values.days) || 7,
        author: AppState.profile?.name || '',
        useAI: values.ai === 'yes'
      });
      showToast(aiError ? 'Report saved (AI summary unavailable, numbers are complete)' : 'Report ready', aiError ? 'error' : 'success');
      window.dispatchEvent(new CustomEvent('motion:pages-changed'));
      window.location.hash = `editor/${page.id}`;
    } catch (error) {
      showToast(`Could not create the report: ${error.message}`, 'error');
      button.disabled = false;
      button.innerHTML = original;
    }
  });
  container.querySelector('[data-new-page]')?.addEventListener('click', () => startNewPageIn(project.id));
  container.querySelector('[data-add-task]')?.addEventListener('click', async () => {
    const draft = await requestNewTask({ members, heading: `New task in “${project.title}”` });
    if (!draft) return;
    const { title, ...options } = draft;
    const { error } = await createTask(title, { ...options, workspaceId, pageId: project.id, sortOrder: Date.now() });
    if (error) return showToast(`Could not create task: ${error.message}`, 'error');
    showToast(`Task “${title}” added`, 'success');
    refresh();
  });
  container.querySelectorAll('[data-toggle]').forEach((button) => button.addEventListener('click', async () => {
    const { error } = await toggleTask(button.dataset.toggle, true);
    if (error) return showToast(`Could not update task: ${error.message}`, 'error');
    showToast('Task done', 'success');
    refresh();
  }));
  container.querySelectorAll('[data-open]').forEach((button) => button.addEventListener('click', () => {
    const task = tasks.find((item) => item.id === button.dataset.open);
    if (task) openTaskDetails(task, members, refresh, { teams });
  }));
}

// YouTube lessons (from feature/youtube-ai): list the project's lessons and add new ones.
async function renderLessonsTab(container, { bar, project, workspaceId, role }) {
  const { data: lessons, error } = await listProjectLessons(project.id);
  // Same rule as the database: owners, admins and editors add lessons; everyone in the team can watch them.
  const canAddLessons = ['owner', 'admin', 'editor'].includes(role);
  const statusLabel = { ready: '<span class="meeting-status is-ended">Analysed</span>', analyzing: '<span class="meeting-status">Partly analysed</span>', new: '<span class="meeting-status">Not analysed</span>' };
  const row = (lesson) => `<li><a href="#lesson/${escapeHtml(lesson.id)}">
      <img class="lesson-thumb" src="https://i.ytimg.com/vi/${escapeHtml(lesson.video_id)}/mqdefault.jpg" alt="" loading="lazy" />
      <span class="meeting-list-main"><strong>${escapeHtml(lesson.title || 'YouTube lesson')}</strong><small>${lesson.duration_seconds ? `${escapeHtml(formatTime(lesson.duration_seconds))} · ` : ''}Added ${escapeHtml(timeAgo(lesson.created_at))}</small></span>
      ${statusLabel[lesson.status] || ''}
    </a></li>`;
  const body = error
    ? `<div class="team-chat-error" role="alert">${escapeHtml(isMissingLessonsTable(error) ? LESSON_SETUP_MESSAGE : `Could not load lessons: ${error.message}`)}</div>`
    : lessons.length
      ? `<ul class="meeting-list lesson-list">${lessons.map(row).join('')}</ul>`
      : `<div class="project-hint">${iconSvg('monitor-play')}<div><strong>No lessons yet</strong><p>${canAddLessons ? 'Add a YouTube lecture or tutorial. The AI writes timestamped notes, a summary and chapters, and answers questions like “at what minute is this explained?”.' : 'When a team owner, admin or editor adds a YouTube lesson, it appears here with AI notes you can search and ask about.'}</p></div></div>`;
  container.innerHTML = `<div class="project-view">${bar}
    <section class="project-section">
      <div class="project-section-head"><h2>YouTube lessons</h2>${error || !canAddLessons ? '' : `<button type="button" class="project-btn primary" data-new-lesson>${iconSvg('plus')} Add YouTube lesson</button>`}</div>
      ${body}
    </section></div>`;

  container.querySelector('[data-new-lesson]')?.addEventListener('click', async () => {
    const values = await requestForm({
      title: 'Add YouTube lesson',
      description: 'Paste the link of a public YouTube video.',
      submitLabel: 'Add lesson',
      fields: [
        { name: 'url', label: 'YouTube link', required: true, placeholder: 'https://www.youtube.com/watch?v=…' },
        { name: 'title', label: 'Title (optional)', maxLength: 200, placeholder: 'Taken from the video if left empty' }
      ]
    });
    if (!values?.url) return;
    const videoId = parseYouTubeId(values.url);
    if (!videoId) return showToast('That does not look like a YouTube video link.', 'error');
    const existing = await findLesson(project.id, videoId);
    if (existing) {
      showToast('This video is already a lesson in this project.', 'success');
      window.location.hash = `lesson/${existing.id}`;
      return;
    }
    const { data, error: createError } = await createLesson({ workspaceId, projectId: project.id, videoId, title: values.title.slice(0, 200), userId: AppState.user?.id });
    if (createError) {
      return showToast(isMissingLessonsTable(createError) ? LESSON_SETUP_MESSAGE : `Could not add the lesson: ${createError.message}`, 'error');
    }
    window.location.hash = `lesson/${data.id}`;
  });
}

// Live meetings: shared agenda timer and notes; minutes become tasks, decisions and a page.
function meetingStatusLabel(meeting) {
  if (meeting.status === 'live') return '<span class="meeting-status is-live"><span class="meeting-live-dot" aria-hidden="true"></span>Live now</span>';
  if (meeting.status === 'ended') return '<span class="meeting-status is-ended">Ended</span>';
  return '<span class="meeting-status is-planned">Planned</span>';
}

async function renderMeetingsTab(container, { bar, project, workspaceId, role }) {
  const { data: meetings, error } = await listProjectMeetings(project.id);
  // Same rule as the database: owners, admins and editors plan and run meetings; everyone in the team can follow them.
  const canPlan = ['owner', 'admin', 'editor'].includes(role);
  const formatDate = (value) => (value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');
  const row = (meeting) => {
    const agenda = Array.isArray(meeting.agenda) ? meeting.agenda : [];
    const minutes = agenda.reduce((sum, item) => sum + (Number(item.minutes) || 0), 0);
    const when = meeting.status === 'ended' ? `Ended ${formatDate(meeting.ended_at)}` : meeting.status === 'live' ? `Started ${formatDate(meeting.started_at)}` : `Created ${formatDate(meeting.created_at)}`;
    return `<li><a href="#meeting/${escapeHtml(meeting.id)}">
      ${iconSvg(meeting.status === 'ended' ? 'notebook-text' : 'users-round')}
      <span class="meeting-list-main"><strong>${escapeHtml(meeting.title || 'Untitled meeting')}</strong><small>${escapeHtml(when)} · ${agenda.length} item${agenda.length === 1 ? '' : 's'} · ${minutes} min${meeting.minutes_page_id ? ' · Minutes saved' : ''}</small></span>
      ${meetingStatusLabel(meeting)}
    </a></li>`;
  };
  const body = error
    ? `<div class="team-chat-error" role="alert">${escapeHtml(isMissingMeetingsTable(error) ? MEETING_SETUP_MESSAGE : `Could not load meetings: ${error.message}`)}</div>`
    : meetings.length
      ? `<ul class="meeting-list">${meetings.map(row).join('')}</ul>`
      : `<div class="project-hint">${iconSvg('users-round')}<div><strong>No live meetings yet</strong><p>${canPlan ? 'Plan a meeting with a timed agenda, or use “Plan a meeting” on the Overview to build the agenda from blockers and deadlines.' : 'When an editor plans a meeting it appears here.'} Everyone sees the same timer and adds notes live; the minutes become tasks, decisions and a page.</p></div></div>`;
  container.innerHTML = `<div class="project-view">${bar}
    <section class="project-section">
      <div class="project-section-head"><h2>Live meetings</h2>${error || !canPlan ? '' : `<button type="button" class="project-btn primary" data-new-meeting>${iconSvg('plus')} New meeting</button>`}</div>
      ${body}
    </section></div>`;

  container.querySelector('[data-new-meeting]')?.addEventListener('click', async () => {
    const values = await requestForm({
      title: 'New meeting',
      description: `Plan a meeting for “${project.title || 'this project'}”.`,
      submitLabel: 'Create meeting',
      fields: [
        { name: 'title', label: 'Title', required: true, maxLength: 200, placeholder: 'Weekly sync' },
        { name: 'agenda', label: 'Agenda', type: 'textarea', placeholder: ['Status updates - 10', 'Budget review - 15', 'Next steps - 5'].join('\n'), hint: 'One item per line, as “Title - minutes”. Items without minutes get 10.' }
      ]
    });
    if (!values?.title) return;
    const agenda = parseAgenda(values.agenda);
    const { data, error: createError } = await createMeeting({
      workspaceId,
      projectId: project.id,
      title: values.title.slice(0, 200),
      agenda: agenda.length ? agenda : [{ id: 'item-1', title: 'Discussion', minutes: 30 }],
      userId: AppState.user?.id
    });
    if (createError) {
      return showToast(isMissingMeetingsTable(createError) ? MEETING_SETUP_MESSAGE : `Could not create the meeting: ${createError.message}`, 'error');
    }
    showToast('Meeting created', 'success');
    window.location.hash = `meeting/${data.id}`;
  });
}
