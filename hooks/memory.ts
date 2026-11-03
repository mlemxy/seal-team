// The memory guard: pinned ids in MEMORY.md can only leave by moving to ARCHIVE.md first.

const PINNED_ID = /\b(?:AC|D|R|Q|C|P)-\d+\b/g

// Visible on purpose: the PRD, plans and reports are for the user to read, and a dot-folder hides them.
export const MEMORY_DIR = 'seal-team'
// Earlier versions' project folder, moved to MEMORY_DIR on the next session start.
export const OLD_MEMORY_DIR = '.seal-team'
// Settings across projects stay out of sight in the home folder.
export const HOME_DIR = '.seal-team'
// About 1,500 tokens of memory and 500 of preferences on every request.
export const MEMORY_CHARS = 6000
export const PREFERENCES_CHARS = 2000

/** The pinned ids a memory page mentions, such as D-3 and AC-12. */
export function pinnedIds(text: string): Set<string> {
  return new Set(text.match(PINNED_ID) ?? [])
}

/** Ids the old page had that the new page and the archive both lack. */
export function droppedIds(before: string, after: string, archive: string): string[] {
  const kept = new Set([...pinnedIds(after), ...pinnedIds(archive)])
  return [...pinnedIds(before)].filter(id => !kept.has(id)).sort()
}

/** The text an Edit call would leave, applied the way the Edit tool applies it. */
export function afterEdit(text: string, oldString: string, newString: string, replaceAll: boolean): string {
  return replaceAll ? text.split(oldString).join(newString) : text.replace(oldString, () => newString)
}

/** Cuts text to a budget, keeping the start, where the pinned section lives. */
export function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + '\n[cut to fit: read the file for the rest]'
}
