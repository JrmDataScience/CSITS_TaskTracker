import { Store, localDate } from './storage.js';
import { TaskService, isOverdue } from './tasks.js';
import { MemberService } from './members.js';
import { buildReport, dateKey, downloadCSV, escapeHTML, formatDate, getCurrentWeek, renderReport } from './reports.js';

// UI-only state: persisted tasks, members, and preferences live in their services.
const state = {
  page: 'dashboard', dashboardSearch: '', dashboardStatus: '', boardSearch: '', boardMember: '', boardPriority: '', boardDue: '', memberSearch: '', report: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const initials = (name = '?') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '?';
const today = () => localDate();
const memberFor = (id, members = MemberService.all()) => members.find((member) => member.id === id);
const memberName = (id, members) => memberFor(id, members)?.name || 'Unassigned member';
const statusClass = (status) => ({ 'To Do': 'status-todo', 'In Progress': 'status-progress', Completed: 'status-completed' }[status] || 'status-todo');
const priorityClass = (priority) => `priority-${String(priority || '').toLowerCase()}`;
const emptyTable = (message, action = '') => `<tr class="table-empty"><td colspan="6"><div class="empty-state"><b>${escapeHTML(message)}</b>${action}</div></td></tr>`;
const htmlTaskTitle = (task) => `<div class="task-cell"><strong>${escapeHTML(task.title)}</strong>${task.description ? `<small>${escapeHTML(task.description.length > 62 ? `${task.description.slice(0, 62)}…` : task.description)}</small>` : ''}</div>`;
const avatar = (name) => `<span class="member-avatar" aria-hidden="true">${escapeHTML(initials(name))}</span>`;

// Brief, non-blocking feedback for completed actions and validation problems.
const toast = (message, type = 'success') => {
  const el = document.createElement('div'); el.className = `toast ${type === 'error' ? 'error' : ''}`; el.textContent = message;
  $('#toastRegion').append(el); setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 230); }, 3600);
};

// Keep the toggle label descriptive by showing the mode that will be enabled next.
const updateThemeButton = () => {
  const darkMode = document.body.classList.contains('dark-mode');
  $('#themeIcon').textContent = darkMode ? '☀' : '◐';
  $('#themeLabel').textContent = darkMode ? 'Light mode' : 'Dark mode';
  $('#themeToggle').title = darkMode ? 'Switch to light mode' : 'Switch to dark mode';
};

const pageMeta = {
  dashboard: ['Dashboard', 'A focused view of your organization’s work.'],
  board: ['Task Board', 'Plan, prioritize, and keep every task moving.'],
  members: ['Members', 'Manage the people driving CSITS forward.']
};

// Keep the page title, context, action buttons, and active nav item in sync.
const renderHeader = () => {
  const [title, description] = pageMeta[state.page];
  $('#pageTitle').textContent = title; $('#pageDescription').textContent = description;
  $('#headerActions').innerHTML = state.page === 'members'
    ? '<button class="button button-primary" data-action="add-member">+ Add member</button>'
    : `<button class="button button-secondary" data-action="open-report">Report</button><button class="button button-primary" data-action="add-task">+ Add task</button>`;
  document.querySelectorAll('.nav-link[data-page]').forEach((button) => button.classList.toggle('active', button.dataset.page === state.page));
};

const setPage = (page) => {
  state.page = page;
  ['dashboard', 'board', 'members'].forEach((name) => {
    const section = $(`#${name}Page`); const active = name === page;
    section.hidden = !active; section.classList.toggle('active-page', active);
  });
  renderHeader(); $('#sidebar').classList.remove('open'); $('#mobileMenu').setAttribute('aria-expanded', 'false');
};

// Dashboard statistics and the overview table always derive from current saved tasks.
const renderDashboard = () => {
  const tasks = TaskService.all(); const ref = today();
  const counts = { total: tasks.length, todo: tasks.filter((task) => task.status === 'To Do').length, progress: tasks.filter((task) => task.status === 'In Progress').length, completed: tasks.filter((task) => task.status === 'Completed').length, overdue: tasks.filter((task) => isOverdue(task, ref)).length };
  const cards = [
    ['Total Tasks', counts.total, 'All active records', '#8b3dad'], ['To Do', counts.todo, 'Ready to begin', '#2775d8'], ['In Progress', counts.progress, 'Work underway', '#d68a18'], ['Completed', counts.completed, 'Work delivered', '#1baa88'], ['Overdue', counts.overdue, 'Needs attention', '#d74d55']
  ];
  $('#summaryStats').innerHTML = cards.map(([label, count, note, color]) => `<article class="stat-card" style="--stat-color:${color}"><label>${label}</label><strong class="stat-number">${count}</strong><span class="stat-foot">${note}</span></article>`).join('');
  const week = getCurrentWeek();
  const created = tasks.filter((task) => { const date = dateKey(task.createdAt); return date >= week.start && date <= week.end; }).length;
  const completed = tasks.filter((task) => (task.statusHistory || []).some((entry) => entry.status === 'Completed' && dateKey(entry.changedAt) >= week.start && dateKey(entry.changedAt) <= week.end)).length;
  const completion = counts.total ? Math.round((counts.completed / counts.total) * 100) : 0;
  $('#weeklySummary').innerHTML = [
    [completed, 'Completed this week'], [created, 'Created this week'], [counts.overdue, 'Currently overdue'], [`${completion}%`, 'Overall completion']
  ].map(([value, label]) => `<div class="weekly-item"><strong>${value}</strong><span>${label}</span></div>`).join('');
  $('#dashboardSearch').value = state.dashboardSearch; $('#dashboardStatusFilter').value = state.dashboardStatus;
  const search = state.dashboardSearch.toLowerCase();
  const filtered = tasks.filter((task) => (!search || task.title.toLowerCase().includes(search) || task.description.toLowerCase().includes(search)) && (!state.dashboardStatus || task.status === state.dashboardStatus)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  $('#dashboardTaskCount').textContent = `${filtered.length} of ${tasks.length} task${tasks.length === 1 ? '' : 's'}`;
  const members = MemberService.all();
  const noRecords = !tasks.length && !members.length;
  $('#dashboardTaskRows').innerHTML = filtered.length ? filtered.map((task) => {
    const member = memberFor(task.memberId, members); const name = member?.name || 'Unassigned member'; const overdue = isOverdue(task, ref);
    return `<tr><td>${htmlTaskTitle(task)}</td><td>${avatar(name)}${escapeHTML(name)}</td><td><span class="${overdue ? 'status-overdue' : ''}">${escapeHTML(formatDate(task.dueDate))}</span></td><td><span class="badge ${priorityClass(task.priority)}">${escapeHTML(task.priority)}</span></td><td><span class="badge ${overdue ? 'status-overdue' : statusClass(task.status)}">${escapeHTML(overdue ? 'Overdue' : task.status)}</span></td><td class="action-cell"><button class="row-action" data-action="view-task" data-id="${escapeHTML(task.id)}">View</button><button class="row-action" data-action="edit-task" data-id="${escapeHTML(task.id)}">Edit</button><button class="row-action delete" data-action="delete-task" data-id="${escapeHTML(task.id)}">Delete</button></td></tr>`;
  }).join('') : emptyTable(tasks.length ? 'No tasks match these filters.' : 'No tasks yet.', tasks.length ? '' : noRecords ? '<button class="button button-primary" data-action="load-demo">Load demonstration data</button>' : '<button class="button button-primary" data-action="add-task">Add your first task</button>');
};

const populateBoardMembers = () => {
  const select = $('#boardMemberFilter'); const members = MemberService.all();
  select.innerHTML = `<option value="">All members</option>${members.map((member) => `<option value="${escapeHTML(member.id)}">${escapeHTML(member.name)}</option>`).join('')}`;
  select.value = state.boardMember;
};

// Board filters change only the displayed collection; they never alter saved tasks.
const renderBoard = () => {
  populateBoardMembers();
  $('#boardSearch').value = state.boardSearch; $('#boardPriorityFilter').value = state.boardPriority; $('#boardDueFilter').value = state.boardDue;
  const ref = today(); const members = MemberService.all(); const search = state.boardSearch.toLowerCase();
  const tasks = TaskService.all().filter((task) => {
    const upcoming = task.dueDate >= ref && task.dueDate <= localDate(new Date(new Date(`${ref}T12:00:00`).getTime() + 6 * 86400000));
    const dueMatches = !state.boardDue || (state.boardDue === 'overdue' && isOverdue(task, ref)) || (state.boardDue === 'upcoming' && upcoming) || (state.boardDue === 'none' && !task.dueDate);
    return (!search || task.title.toLowerCase().includes(search)) && (!state.boardMember || task.memberId === state.boardMember) && (!state.boardPriority || task.priority === state.boardPriority) && dueMatches;
  });
  const card = (task) => {
    const member = memberFor(task.memberId, members); const name = member?.name || 'Unassigned member'; const overdue = isOverdue(task, ref);
    return `<article class="task-card"><h3>${escapeHTML(task.title)}</h3><p class="task-desc">${escapeHTML(task.description || 'No description added.')}</p><div class="task-card-meta"><span class="card-member"><span class="mini-avatar">${escapeHTML(initials(name))}</span>${escapeHTML(name)}</span><span class="${overdue ? 'status-overdue' : ''}">◷ ${escapeHTML(formatDate(task.dueDate))}</span><span class="badge ${priorityClass(task.priority)}">${escapeHTML(task.priority)}</span><span class="badge ${statusClass(task.status)}">${escapeHTML(task.status)}</span></div><div class="card-footer"><label class="sr-only" for="status-${escapeHTML(task.id)}">Change ${escapeHTML(task.title)} status</label><select class="card-status-select" id="status-${escapeHTML(task.id)}" data-task-status data-id="${escapeHTML(task.id)}"><option${task.status === 'To Do' ? ' selected' : ''}>To Do</option><option${task.status === 'In Progress' ? ' selected' : ''}>In Progress</option><option${task.status === 'Completed' ? ' selected' : ''}>Completed</option></select><div class="card-actions"><button class="card-action" data-action="view-task" data-id="${escapeHTML(task.id)}" aria-label="View ${escapeHTML(task.title)}">◉</button><button class="card-action" data-action="edit-task" data-id="${escapeHTML(task.id)}" aria-label="Edit ${escapeHTML(task.title)}">✎</button><button class="card-action card-delete" data-action="delete-task" data-id="${escapeHTML(task.id)}" aria-label="Delete ${escapeHTML(task.title)}">×</button></div></div></article>`;
  };
  const columns = [['To Do', '#2775d8'], ['In Progress', '#d68a18'], ['Completed', '#1baa88']];
  $('#kanbanBoard').innerHTML = columns.map(([status, color]) => {
    const items = tasks.filter((task) => task.status === status).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return `<section class="kanban-column" style="--col:${color}"><div class="kanban-head"><div class="kanban-title"><span class="kanban-dot"></span>${status}</div><span class="column-count">${items.length}</span></div><div class="card-stack">${items.length ? items.map(card).join('') : '<div class="empty-state"><b>No matching tasks</b>Use the add button to create one.</div>'}</div></section>`;
  }).join('');
};

// Assignment totals are calculated live rather than stored redundantly on members.
const renderMembers = () => {
  const members = MemberService.all(); const tasks = TaskService.all(); const search = state.memberSearch.toLowerCase();
  $('#memberSearch').value = state.memberSearch;
  const filtered = members.filter((member) => [member.name, member.role, member.email].some((value) => value.toLowerCase().includes(search))).sort((a, b) => a.name.localeCompare(b.name));
  $('#memberCount').textContent = `${filtered.length} member${filtered.length === 1 ? '' : 's'}`;
  $('#memberRows').innerHTML = filtered.length ? filtered.map((member) => {
    const assigned = tasks.filter((task) => task.memberId === member.id); const completed = assigned.filter((task) => task.status === 'Completed').length;
    return `<tr><td>${avatar(member.name)}<span class="member-name">${escapeHTML(member.name)}</span><span class="muted">${escapeHTML(member.id)}</span></td><td>${escapeHTML(member.role)}</td><td>${member.email ? `<a href="mailto:${encodeURIComponent(member.email)}">${escapeHTML(member.email)}</a>` : '<span class="muted">Not provided</span>'}</td><td>${assigned.length}</td><td>${completed}</td><td class="action-cell"><button class="row-action" data-action="edit-member" data-id="${escapeHTML(member.id)}">Edit</button><button class="row-action delete" data-action="delete-member" data-id="${escapeHTML(member.id)}">Delete</button></td></tr>`;
  }).join('') : emptyTable(members.length ? 'No members match your search.' : 'No members yet.', members.length ? '' : !tasks.length ? '<button class="button button-primary" data-action="load-demo">Load demonstration data</button>' : '<button class="button button-primary" data-action="add-member">Add a member</button>');
};

// One refresh point after every CRUD/status action keeps all views synchronized.
const renderAll = () => { renderDashboard(); renderBoard(); renderMembers(); };

const openModal = (id) => { const modal = $(`#${id}`); modal.hidden = false; document.body.style.overflow = 'hidden'; setTimeout(() => modal.querySelector('input, select, textarea, button')?.focus(), 0); };
const closeModal = (id) => { const modal = $(`#${id}`); modal.hidden = true; document.body.style.overflow = ''; };
const clearErrors = (form) => form.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; el.previousElementSibling?.classList?.remove('input-invalid'); });
const showErrors = (form, errors) => Object.entries(errors).forEach(([key, message]) => { const error = form.querySelector(`[data-error="${key}"]`); if (error) { error.textContent = message; error.previousElementSibling.classList.add('input-invalid'); } });

const taskMemberOptions = (selected = '') => {
  const members = MemberService.all();
  return `<option value="">Select a member</option>${members.map((member) => `<option value="${escapeHTML(member.id)}"${member.id === selected ? ' selected' : ''}>${escapeHTML(member.name)} — ${escapeHTML(member.role)}</option>`).join('')}`;
};

// The same task form supports creation and editing by optionally accepting an ID.
const openTaskModal = (id = '') => {
  const members = MemberService.all();
  if (!members.length) { toast('Add a member before assigning a task.', 'error'); setPage('members'); return; }
  const task = id ? TaskService.get(id) : null; if (id && !task) { toast('This task is no longer available.', 'error'); return; }
  const form = $('#taskForm'); form.reset(); clearErrors(form); $('#taskId').value = task?.id || ''; $('#taskModalTitle').textContent = task ? 'Edit task' : 'Add task'; $('#taskSubmit').textContent = task ? 'Save changes' : 'Create task';
  $('#taskMember').innerHTML = taskMemberOptions(task?.memberId);
  $('#taskTitle').value = task?.title || ''; $('#taskDescription').value = task?.description || ''; $('#taskDueDate').value = task?.dueDate || ''; $('#taskPriority').value = task?.priority || 'Medium'; $('#taskStatus').value = task?.status || 'To Do';
  openModal('taskModal');
};

const openMemberModal = (id = '') => {
  const member = id ? MemberService.get(id) : null; if (id && !member) { toast('This member is no longer available.', 'error'); return; }
  const form = $('#memberForm'); form.reset(); clearErrors(form); $('#memberId').value = member?.id || ''; $('#memberModalTitle').textContent = member ? 'Edit member' : 'Add member';
  $('#memberName').value = member?.name || ''; $('#memberRole').value = member?.role || ''; $('#memberEmail').value = member?.email || ''; openModal('memberModal');
};

const openDetailModal = (id) => {
  const task = TaskService.get(id); if (!task) { toast('This task is no longer available.', 'error'); return; }
  const member = memberFor(task.memberId); const name = member?.name || 'Unassigned member'; const changed = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(task.updatedAt));
  $('#detailModalTitle').textContent = task.title; $('#detailEditButton').dataset.taskId = task.id;
  $('#taskDetailContent').innerHTML = `<dl class="detail-list"><div><dt>Assigned to</dt><dd>${avatar(name)}${escapeHTML(name)}</dd></div><div><dt>Due date</dt><dd>${escapeHTML(formatDate(task.dueDate))}</dd></div><div><dt>Priority</dt><dd><span class="badge ${priorityClass(task.priority)}">${escapeHTML(task.priority)}</span></dd></div><div><dt>Status</dt><dd><span class="badge ${statusClass(task.status)}">${escapeHTML(task.status)}</span></dd></div><div><dt>Last updated</dt><dd>${escapeHTML(changed)}</dd></div><div><dt>Description</dt><dd class="detail-description">${escapeHTML(task.description || 'No description provided.')}</dd></div></dl>`;
  openModal('detailModal');
};

// Reports open with the current local Monday-to-Sunday week preselected.
const openReport = () => {
  const week = getCurrentWeek(); $('#reportStart').value = week.start; $('#reportEnd').value = week.end; generateReport(); openModal('reportModal');
};
// Save the generated object in UI state so Print and CSV use the exact same data.
const generateReport = () => {
  const start = $('#reportStart').value; const end = $('#reportEnd').value;
  if (!start || !end || start > end) { toast('Choose a valid reporting period: start date must not be after end date.', 'error'); return false; }
  state.report = buildReport(TaskService.all(), MemberService.all(), start, end); $('#reportOutput').innerHTML = renderReport(state.report); return true;
};

const deleteTask = (id) => {
  const task = TaskService.get(id); if (!task) { toast('This task is no longer available.', 'error'); return; }
  if (!window.confirm(`Delete “${task.title}”? This cannot be undone.`)) return;
  TaskService.remove(id); renderAll(); toast('Task deleted.');
};
const deleteMember = (id) => {
  const member = MemberService.get(id); if (!member) { toast('This member is no longer available.', 'error'); return; }
  if (TaskService.all().some((task) => task.memberId === id)) { toast('Reassign or delete this member’s tasks before deleting them.', 'error'); return; }
  if (window.confirm(`Delete ${member.name} from the member directory?`)) { MemberService.remove(id, TaskService.all()); renderAll(); toast('Member deleted.'); }
};

document.addEventListener('DOMContentLoaded', () => {
  // First load seeds the demonstration workspace; later refreshes preserve localStorage.
  const seeded = Store.ensureInitialized(); const prefs = Store.getPreferences();
  if (prefs.darkMode) document.body.classList.add('dark-mode');
  $('#appYear').textContent = new Date().getFullYear(); renderAll(); renderHeader();
  updateThemeButton();
  if (seeded) toast('Sample CSITS data is ready to explore.');

  $('#mobileMenu').addEventListener('click', () => { const sidebar = $('#sidebar'); sidebar.classList.toggle('open'); $('#mobileMenu').setAttribute('aria-expanded', String(sidebar.classList.contains('open'))); });
  $('#themeToggle').addEventListener('click', () => { document.body.classList.toggle('dark-mode'); Store.savePreferences({ ...Store.getPreferences(), darkMode: document.body.classList.contains('dark-mode') }); updateThemeButton(); });
  $('#taskForm').addEventListener('submit', (event) => {
    event.preventDefault(); const form = event.currentTarget; clearErrors(form); const data = Object.fromEntries(new FormData(form)); const id = data.id || $('#taskId').value; const result = id ? TaskService.update(id, data, MemberService.all()) : TaskService.create(data, MemberService.all());
    if (result.errors) { showErrors(form, result.errors); return; } closeModal('taskModal'); renderAll(); toast(id ? 'Task updated.' : 'Task created.');
  });
  $('#memberForm').addEventListener('submit', (event) => {
    event.preventDefault(); const form = event.currentTarget; clearErrors(form); const data = Object.fromEntries(new FormData(form)); const id = data.id || $('#memberId').value; const result = id ? MemberService.update(id, data) : MemberService.create(data);
    if (result.errors) { showErrors(form, result.errors); return; } closeModal('memberModal'); renderAll(); toast(id ? 'Member updated.' : 'Member added.');
  });
});

document.addEventListener('click', (event) => {
  // Event delegation also covers cards, rows, and buttons created during re-renders.
  const nav = event.target.closest('[data-page]'); if (nav) { setPage(nav.dataset.page); return; }
  const close = event.target.closest('[data-close-modal]'); if (close) { closeModal(close.dataset.closeModal); return; }
  if (event.target.classList.contains('modal-backdrop')) { closeModal(event.target.id); return; }
  const action = event.target.closest('[data-action]'); if (!action) return;
  const id = action.dataset.id;
  switch (action.dataset.action) {
    case 'add-task': openTaskModal(); break; case 'edit-task': openTaskModal(id); break; case 'view-task': openDetailModal(id); break; case 'delete-task': deleteTask(id); break;
    case 'add-member': openMemberModal(); break; case 'edit-member': openMemberModal(id); break; case 'delete-member': deleteMember(id); break;
    case 'load-demo': Store.loadDemoData(); renderAll(); toast('Demonstration data loaded.'); break;
    case 'open-report': openReport(); break;
    case 'current-week': { const week = getCurrentWeek(); $('#reportStart').value = week.start; $('#reportEnd').value = week.end; break; }
    case 'generate-report': generateReport(); break;
    case 'export-csv': if (state.report || generateReport()) downloadCSV(state.report); break;
    case 'print-report': if (state.report || generateReport()) window.print(); break;
  }
});

document.addEventListener('input', (event) => {
  // Re-focus rebuilt search inputs so filtering remains comfortable while typing.
  if (event.target.id === 'dashboardSearch') { state.dashboardSearch = event.target.value; renderDashboard(); const input = $('#dashboardSearch'); input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  if (event.target.id === 'boardSearch') { state.boardSearch = event.target.value; renderBoard(); const input = $('#boardSearch'); input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  if (event.target.id === 'memberSearch') { state.memberSearch = event.target.value; renderMembers(); const input = $('#memberSearch'); input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
});

document.addEventListener('change', (event) => {
  // Status selectors save immediately, then refresh all dependent statistics/views.
  if (event.target.id === 'dashboardStatusFilter') { state.dashboardStatus = event.target.value; renderDashboard(); }
  if (event.target.id === 'boardMemberFilter') { state.boardMember = event.target.value; renderBoard(); }
  if (event.target.id === 'boardPriorityFilter') { state.boardPriority = event.target.value; renderBoard(); }
  if (event.target.id === 'boardDueFilter') { state.boardDue = event.target.value; renderBoard(); }
  if (event.target.matches('[data-task-status]')) { const task = TaskService.setStatus(event.target.dataset.id, event.target.value); if (task) { renderAll(); toast(`Task moved to ${task.status}.`); } }
});

document.addEventListener('click', (event) => {
  if (event.target.id === 'detailEditButton') { const id = event.target.dataset.taskId; closeModal('detailModal'); openTaskModal(id); }
});

document.addEventListener('keydown', (event) => { if (event.key === 'Escape') document.querySelectorAll('.modal-backdrop:not([hidden])').forEach((modal) => closeModal(modal.id)); });

window.addEventListener('storage', () => renderAll());
