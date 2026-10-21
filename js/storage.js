// Centralized browser-storage keys keep persisted data isolated from other sites/apps.
const KEYS = {
  tasks: 'csits-tracker.tasks.v1',
  members: 'csits-tracker.members.v1',
  preferences: 'csits-tracker.preferences.v1',
  initialized: 'csits-tracker.initialized.v1'
};

// Invalid or manually edited localStorage should never stop the interface from loading.
const safeRead = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : fallback;
  } catch { return fallback; }
};

const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const validTimestamp = (value) => typeof value === 'string' && !Number.isNaN(new Date(value).getTime());

// Returns a YYYY-MM-DD date in the user's local timezone (not UTC).
export const localDate = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
};

export const nowISO = () => new Date().toISOString();
export const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const daysFromToday = (offset) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return localDate(date);
};
const timestampDaysAgo = (offset) => {
  const date = new Date();
  date.setHours(10, 30, 0, 0);
  date.setDate(date.getDate() - offset);
  return date.toISOString();
};

// Demonstration dates are generated relative to today, so the sample dashboard stays useful.
const demoData = () => {
  const members = [
    { id: 'member_ava', name: 'Ava Mendoza', role: 'President', email: 'ava.mendoza@csits.org', createdAt: timestampDaysAgo(45) },
    { id: 'member_miguel', name: 'Miguel Santos', role: 'Vice President', email: 'miguel.santos@csits.org', createdAt: timestampDaysAgo(44) },
    { id: 'member_priya', name: 'Priya Reyes', role: 'Technical Lead', email: 'priya.reyes@csits.org', createdAt: timestampDaysAgo(43) },
    { id: 'member_jordan', name: 'Jordan Cruz', role: 'Events Coordinator', email: 'jordan.cruz@csits.org', createdAt: timestampDaysAgo(42) }
  ];
  const task = (id, title, description, memberId, dueOffset, priority, status, createdAgo, changes) => {
    const createdAt = timestampDaysAgo(createdAgo);
    const statusHistory = [{ status: 'To Do', changedAt: createdAt }];
    changes.forEach(([nextStatus, daysAgo]) => statusHistory.push({ status: nextStatus, changedAt: timestampDaysAgo(daysAgo) }));
    return { id, title, description, memberId, dueDate: daysFromToday(dueOffset), priority, status, createdAt, updatedAt: statusHistory.at(-1).changedAt, statusHistory };
  };
  const tasks = [
    task('task_web', 'Publish organization website refresh', 'Review the final copy and deploy the approved landing-page update.', 'member_priya', 3, 'High', 'In Progress', 7, [['In Progress', 4]]),
    task('task_social', 'Prepare membership drive posts', 'Create the social media graphics and posting schedule.', 'member_jordan', 6, 'Medium', 'To Do', 3, []),
    task('task_budget', 'Submit event budget proposal', 'Finalize vendor estimates for the upcoming technology forum.', 'member_miguel', -2, 'High', 'To Do', 8, []),
    task('task_minutes', 'Archive general assembly minutes', 'Upload signed minutes and share the archive link with officers.', 'member_ava', -4, 'Low', 'Completed', 5, [['In Progress', 4], ['Completed', 1]]),
    task('task_workshop', 'Confirm workshop speaker', 'Coordinate logistics and confirmation details with the invited speaker.', 'member_jordan', 9, 'Medium', 'Completed', 13, [['In Progress', 10], ['Completed', 6]]),
    task('task_inventory', 'Audit equipment inventory', 'Verify current equipment condition and identify replacement needs.', 'member_priya', 14, 'Low', 'In Progress', 2, [['In Progress', 1]])
  ];
  return { members, tasks };
};

export const Store = {
  // Normalize each saved record on read to recover gracefully from malformed data.
  getTasks() {
    const data = safeRead(KEYS.tasks, []);
    if (!Array.isArray(data)) return [];
    return data.filter((task) => task && typeof task === 'object').map((task) => ({
      ...task,
      id: typeof task.id === 'string' ? task.id : newId('recovered_task'),
      title: typeof task.title === 'string' ? task.title : 'Untitled task',
      description: typeof task.description === 'string' ? task.description : '',
      memberId: typeof task.memberId === 'string' ? task.memberId : '',
      dueDate: typeof task.dueDate === 'string' ? task.dueDate : '',
      priority: ['Low', 'Medium', 'High'].includes(task.priority) ? task.priority : 'Medium',
      status: ['To Do', 'In Progress', 'Completed'].includes(task.status) ? task.status : 'To Do',
      createdAt: validTimestamp(task.createdAt) ? task.createdAt : nowISO(),
      updatedAt: validTimestamp(task.updatedAt) ? task.updatedAt : nowISO(),
      statusHistory: Array.isArray(task.statusHistory) ? task.statusHistory.filter((entry) => entry && ['To Do', 'In Progress', 'Completed'].includes(entry.status) && validTimestamp(entry.changedAt)) : []
    }));
  },
  saveTasks(tasks) { write(KEYS.tasks, tasks); },
  getMembers() {
    const data = safeRead(KEYS.members, []);
    if (!Array.isArray(data)) return [];
    return data.filter((member) => member && typeof member === 'object').map((member) => ({
      ...member,
      id: typeof member.id === 'string' ? member.id : newId('recovered_member'),
      name: typeof member.name === 'string' ? member.name : 'Unnamed member',
      role: typeof member.role === 'string' ? member.role : 'Member',
      email: typeof member.email === 'string' ? member.email : '',
      createdAt: validTimestamp(member.createdAt) ? member.createdAt : nowISO()
    }));
  },
  saveMembers(members) { write(KEYS.members, members); },
  getPreferences() { return safeRead(KEYS.preferences, {}); },
  savePreferences(preferences) { write(KEYS.preferences, preferences); },
  ensureInitialized() {
    // Seed once only; the initialization flag prevents duplicate records on refresh.
    if (localStorage.getItem(KEYS.initialized)) return false;
    const data = demoData();
    this.saveMembers(data.members);
    this.saveTasks(data.tasks);
    localStorage.setItem(KEYS.initialized, 'true');
    return true;
  },
  loadDemoData() {
    // Used only from the explicit empty-state action to restore the sample workspace.
    const data = demoData();
    this.saveMembers(data.members);
    this.saveTasks(data.tasks);
    localStorage.setItem(KEYS.initialized, 'true');
  }
};
