export function localDueDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// Due dates are instants. An unchanged minute-resolution control must not replace
// the persisted seconds/milliseconds (including across browser time zones).
export function dueDatePatch(value: string, task?: { dueDate: string | null }) {
  if (task && value === localDueDate(task.dueDate)) return {};
  return { dueDate: value ? new Date(value).toISOString() : null };
}
