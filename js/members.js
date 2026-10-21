import { Store, newId, nowISO } from './storage.js';

// Normalize whitespace before validating or saving member details.
const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateMember = (data) => {
  const errors = {};
  if (!clean(data.name)) errors.name = 'Enter the member’s full name.';
  if (!clean(data.role)) errors.role = 'Enter an organization role.';
  const email = clean(data.email);
  if (email && !emailPattern.test(email)) errors.email = 'Enter a valid email address.';
  return errors;
};

const normalize = (data) => ({ name: clean(data.name), role: clean(data.role), email: clean(data.email).toLowerCase() });

export const MemberService = {
  all() { return Store.getMembers(); },
  get(id) { return this.all().find((member) => member.id === id); },
  create(data) {
    const errors = validateMember(data); if (Object.keys(errors).length) return { errors };
    const member = { id: newId('member'), ...normalize(data), createdAt: nowISO() };
    const members = this.all(); members.push(member); Store.saveMembers(members); return { member };
  },
  update(id, data) {
    const errors = validateMember(data); if (Object.keys(errors).length) return { errors };
    const members = this.all(); const index = members.findIndex((member) => member.id === id);
    if (index < 0) return { errors: { name: 'This member no longer exists.' } };
    members[index] = { ...members[index], ...normalize(data), updatedAt: nowISO() }; Store.saveMembers(members); return { member: members[index] };
  },
  remove(id, tasks) {
    // Never leave a task pointing at a member who no longer exists.
    if (tasks.some((task) => task.memberId === id)) return { error: 'Reassign or delete this member’s tasks before deleting them.' };
    const members = this.all(); const next = members.filter((member) => member.id !== id);
    if (next.length === members.length) return { error: 'This member no longer exists.' };
    Store.saveMembers(next); return { success: true };
  }
};
