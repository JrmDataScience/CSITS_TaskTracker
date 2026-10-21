import { Store, newId, nowISO } from './storage.js';

// Keep task option values in one place so forms and saved data remain consistent.
const statuses = ['To Do', 'In Progress', 'Completed'];
const priorities = ['Low', 'Medium', 'High'];

const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

// Validate independently from the form so all task writes follow the same rules.
export const validateTask = (data, members) => {
  const errors = {};
  if (!clean(data.title)) errors.title = 'Enter a task title.';
  if (!data.memberId || !members.some((member) => member.id === data.memberId)) errors.memberId = 'Choose an existing member.';
  if (!data.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(data.dueDate) || Number.isNaN(new Date(`${data.dueDate}T12:00:00`).getTime())) errors.dueDate = 'Choose a valid due date.';
  if (!priorities.includes(data.priority)) errors.priority = 'Choose a valid priority.';
  if (!statuses.includes(data.status)) errors.status = 'Choose a valid status.';
  return errors;
};

const normalize = (data) => ({
  title: clean(data.title), description: String(data.description ?? '').trim(), memberId: data.memberId,
  dueDate: data.dueDate, priority: data.priority, status: data.status
});

export const TaskService = {
  all() { return Store.getTasks(); },
  get(id) { return this.all().find((task) => task.id === id); },
  create(data, members) {
    const errors = validateTask(data, members);
    if (Object.keys(errors).length) return { errors };
    const value = normalize(data); const createdAt = nowISO();
    // The first history entry records the task's initial status for accurate reports.
    const task = { id: newId('task'), ...value, createdAt, updatedAt: createdAt, statusHistory: [{ status: value.status, changedAt: createdAt }] };
    const tasks = this.all(); tasks.push(task); Store.saveTasks(tasks);
    return { task };
  },
  update(id, data, members) {
    const errors = validateTask(data, members);
    if (Object.keys(errors).length) return { errors };
    const tasks = this.all(); const index = tasks.findIndex((task) => task.id === id);
    if (index < 0) return { errors: { title: 'This task no longer exists.' } };
    const existing = tasks[index]; const value = normalize(data); const updatedAt = nowISO();
    const history = Array.isArray(existing.statusHistory) ? [...existing.statusHistory] : [{ status: existing.status || 'To Do', changedAt: existing.createdAt || updatedAt }];
    // Only write a history event when the status actually changes.
    if (existing.status !== value.status) history.push({ status: value.status, changedAt: updatedAt });
    tasks[index] = { ...existing, ...value, updatedAt, statusHistory: history };
    Store.saveTasks(tasks); return { task: tasks[index] };
  },
  setStatus(id, status) {
    if (!statuses.includes(status)) return null;
    const tasks = this.all(); const index = tasks.findIndex((task) => task.id === id);
    if (index < 0 || tasks[index].status === status) return tasks[index] || null;
    const updatedAt = nowISO(); const old = tasks[index];
    const history = Array.isArray(old.statusHistory) ? [...old.statusHistory] : [{ status: old.status || 'To Do', changedAt: old.createdAt || updatedAt }];
    // Kanban status changes use the same audit trail as edits from the modal.
    history.push({ status, changedAt: updatedAt });
    tasks[index] = { ...old, status, updatedAt, statusHistory: history };
    Store.saveTasks(tasks); return tasks[index];
  },
  remove(id) {
    const tasks = this.all(); const next = tasks.filter((task) => task.id !== id);
    if (next.length === tasks.length) return false;
    Store.saveTasks(next); return true;
  }
};

// A completed task is never shown as overdue, even if it was completed after its due date.
export const isOverdue = (task, referenceDate) => task.status !== 'Completed' && Boolean(task.dueDate) && task.dueDate < referenceDate;
export const statusOptions = statuses;
