import { localDate } from './storage.js';

// All user-provided values pass through this helper before template rendering.
export const escapeHTML = (value = '') => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

// Convert timestamps or date inputs into comparable local YYYY-MM-DD strings.
export const dateKey = (value) => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : localDate(date);
};

export const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(`${dateKey(value)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
};

// The app consistently defines a week as Monday through Sunday.
export const getCurrentWeek = () => {
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const day = today.getDay(); const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(today); start.setDate(today.getDate() + mondayOffset);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  return { start: localDate(start), end: localDate(end) };
};

const inRange = (value, start, end) => {
  const key = dateKey(value);
  return Boolean(key && key >= start && key <= end);
};

// Rebuild a task's latest known status at the end of a reporting period.
const statusAt = (task, end) => {
  if (dateKey(task.createdAt) > end) return { status: null, known: true };
  const history = Array.isArray(task.statusHistory) ? [...task.statusHistory] : [];
  const entries = history.filter((entry) => dateKey(entry.changedAt) <= end).sort((a, b) => String(a.changedAt).localeCompare(String(b.changedAt)));
  if (!entries.length) return { status: task.status, known: false };
  return { status: entries.at(-1).status, known: true };
};

const memberName = (task, memberMap) => memberMap.get(task.memberId)?.name || 'Unassigned / removed member';

// Calculate every report section exclusively from persisted tasks and history.
export const buildReport = (tasks, members, start, end) => {
  const memberMap = new Map(members.map((member) => [member.id, member]));
  const existing = tasks.map((task) => ({ task, atEnd: statusAt(task, end) })).filter(({ atEnd }) => atEnd.status);
  const created = tasks.filter((task) => inRange(task.createdAt, start, end));
  const completed = tasks.map((task) => {
    const completion = (task.statusHistory || []).filter((entry) => entry.status === 'Completed' && inRange(entry.changedAt, start, end)).at(-1);
    return completion ? { task, completedOn: dateKey(completion.changedAt) } : null;
  }).filter(Boolean);
  const pending = existing.filter(({ atEnd }) => atEnd.status !== 'Completed');
  const overdue = pending.filter(({ task }) => task.dueDate && task.dueDate < end);
  const breakdown = ['To Do', 'In Progress', 'Completed'].map((status) => ({ status, count: existing.filter(({ atEnd }) => atEnd.status === status).length }));
  const completedByMember = [...new Map(completed.map(({ task }) => {
    const name = memberName(task, memberMap); return [name, (completed.filter(({ task: item }) => memberName(item, memberMap) === name)).length];
  })).entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const completionRate = existing.length ? Math.round((existing.filter(({ atEnd }) => atEnd.status === 'Completed').length / existing.length) * 100) : 0;
  return {
    start, end, generatedAt: new Date(), created, completed, pending, overdue, breakdown, completedByMember, completionRate,
    existingCount: existing.length, completedAtEnd: existing.filter(({ atEnd }) => atEnd.status === 'Completed').length,
    historicalKnown: existing.every(({ atEnd }) => atEnd.known), memberMap
  };
};

const statusClass = (status) => status === 'To Do' ? 'status-todo' : status === 'In Progress' ? 'status-progress' : 'status-completed';
const taskRows = (items, memberMap, kind) => {
  if (!items.length) return '<tr><td colspan="4" class="report-empty">No tasks in this category for this reporting period.</td></tr>';
  return items.map((item) => {
    const task = item.task || item; const date = kind === 'completed' ? item.completedOn : task.dueDate;
    const state = kind === 'completed' ? 'Completed' : kind === 'pending' ? item.atEnd.status : item.atEnd.status;
    return `<tr><td>${escapeHTML(task.title)}</td><td>${escapeHTML(memberName(task, memberMap))}</td><td>${escapeHTML(formatDate(date))}</td><td><span class="badge ${statusClass(state)}">${escapeHTML(state)}</span></td></tr>`;
  }).join('');
};

// Produce the printable report body. Dynamic text is escaped before insertion.
export const renderReport = (report) => {
  const statusRows = report.breakdown.map(({ status, count }) => `<tr><td>${escapeHTML(status)}</td><td>${count}</td></tr>`).join('');
  const memberRows = report.completedByMember.length ? report.completedByMember.map(({ name, count }) => `<tr><td>${escapeHTML(name)}</td><td>${count}</td></tr>`).join('') : '<tr><td colspan="2" class="report-empty">No completed tasks in this period.</td></tr>';
  const generated = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(report.generatedAt);
  return `<article class="report-sheet">
    <header class="report-brand"><div><h2 class="report-title">CSITS Weekly Task Report</h2><p class="report-meta">Reporting period: ${escapeHTML(formatDate(report.start))} – ${escapeHTML(formatDate(report.end))}</p><p class="report-meta">Generated ${escapeHTML(generated)}</p></div><div class="report-logo"><img src="assets/Logo.png" alt="">CSITS Organization</div></header>
    <section class="report-stat-grid"><div class="report-stat"><strong>${report.created.length}</strong><span>Created in period</span></div><div class="report-stat"><strong>${report.completed.length}</strong><span>Completed in period</span></div><div class="report-stat"><strong>${report.pending.length}</strong><span>Pending at period end</span></div><div class="report-stat"><strong>${report.overdue.length}</strong><span>Overdue at period end</span></div></section>
    <section class="report-breakdown"><div><h3>Completion rate</h3><div class="weekly-item"><strong>${report.completionRate}%</strong><span>${report.completedAtEnd} of ${report.existingCount} tasks completed by period end</span></div></div><div><h3>Task status at period end</h3><table class="report-table"><tbody>${statusRows}</tbody></table></div><div><h3>Completed by assigned member</h3><table class="report-table"><thead><tr><th>Member</th><th>Tasks</th></tr></thead><tbody>${memberRows}</tbody></table></div></section>
    <section class="report-section"><h3>Completed tasks</h3><table class="report-table"><thead><tr><th>Task</th><th>Assigned member</th><th>Completed on</th><th>Status</th></tr></thead><tbody>${taskRows(report.completed, report.memberMap, 'completed')}</tbody></table></section>
    <section class="report-section"><h3>Pending or in-progress tasks at period end</h3><table class="report-table"><thead><tr><th>Task</th><th>Assigned member</th><th>Due date</th><th>Status</th></tr></thead><tbody>${taskRows(report.pending, report.memberMap, 'pending')}</tbody></table></section>
    <section class="report-section"><h3>Overdue tasks as of report end</h3><table class="report-table"><thead><tr><th>Task</th><th>Assigned member</th><th>Due date</th><th>Status</th></tr></thead><tbody>${taskRows(report.overdue, report.memberMap, 'overdue')}</tbody></table></section>
    ${report.historicalKnown ? '' : '<p class="report-meta">Note: one or more legacy tasks have no full history; their listed period-end status reflects their current saved status.</p>'}
    <footer class="report-footer">Generated by the CSITS Task Tracker</footer>
  </article>`;
};

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const csvLine = (fields) => fields.map(csvCell).join(',');

export const reportCSV = (report) => {
  const rows = [
    ['CSITS Weekly Task Report'], ['Reporting period', formatDate(report.start), 'to', formatDate(report.end)], [],
    ['Summary'], ['Tasks created during period', report.created.length], ['Tasks completed during period', report.completed.length], ['Tasks pending at period end', report.pending.length], ['Overdue tasks at period end', report.overdue.length], ['Completion rate', `${report.completionRate}%`], [],
    ['Status breakdown'], ['Status', 'Task count'], ...report.breakdown.map(({ status, count }) => [status, count]), [],
    ['Completed by member'], ['Member', 'Completed tasks'], ...report.completedByMember.map(({ name, count }) => [name, count]), [],
    ['Completed tasks'], ['Task', 'Assigned member', 'Completed on', 'Status'], ...report.completed.map(({ task, completedOn }) => [task.title, memberName(task, report.memberMap), formatDate(completedOn), 'Completed']), [],
    ['Pending or in-progress tasks at period end'], ['Task', 'Assigned member', 'Due date', 'Status'], ...report.pending.map(({ task, atEnd }) => [task.title, memberName(task, report.memberMap), formatDate(task.dueDate), atEnd.status]), [],
    ['Overdue tasks as of report end'], ['Task', 'Assigned member', 'Due date', 'Status'], ...report.overdue.map(({ task, atEnd }) => [task.title, memberName(task, report.memberMap), formatDate(task.dueDate), atEnd.status])
  ];
  return `\uFEFF${rows.map(csvLine).join('\r\n')}`;
};

// Create a temporary browser download that matches the report currently on screen.
export const downloadCSV = (report) => {
  const url = URL.createObjectURL(new Blob([reportCSV(report)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `csits-weekly-report-${report.start}-to-${report.end}.csv`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
