/**
 * Lead status values: single source of truth for Kanban columns and status dropdowns.
 * Matches backend STATUS and STATUS_KANBAN_COLUMNS (outreach lifecycle).
 */

export const STATUS_KANBAN_COLUMNS = ['New', 'Enriched', 'Email Sent', 'Opened', 'Waiting for Reply', 'Replied', 'Converted'];

/** Legacy status mapping: Contacted/Qualified shown as Email Sent/Replied in UI */
export function toDisplayStatus(status) {
    const s = status || 'New';
    if (s === 'Contacted') return 'Email Sent';
    if (s === 'Qualified') return 'Replied';
    return s;
}

export const STATUS_OPTIONS = [...STATUS_KANBAN_COLUMNS];

export default STATUS_KANBAN_COLUMNS;
