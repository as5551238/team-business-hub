/**
 * Shared time-range utility for Goals/Projects/Tasks filter pages.
 * Computes start/end ISO date strings for common time ranges, using Monday as week start.
 */

export interface TimeBounds { start: string; end: string }

function toISO(d: Date): string { return d.toISOString().split('T')[0]; }

/** Get the Monday-based week bounds containing `today` */
function weekBounds(today: Date): TimeBounds {
  const day = today.getDay(); // 0=Sun, 1=Mon...
  const mondayOffset = day === 0 ? -6 : 1 - day; // days since Monday
  const mon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + mondayOffset);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  return { start: toISO(mon), end: toISO(sun) };
}

/** Get month bounds */
function monthBounds(today: Date): TimeBounds {
  const start = toISO(new Date(today.getFullYear(), today.getMonth(), 1));
  const end = toISO(new Date(today.getFullYear(), today.getMonth() + 1, 0));
  return { start, end };
}

/** Get quarter bounds */
function quarterBounds(today: Date): TimeBounds {
  const qi = Math.floor(today.getMonth() / 3);
  const start = toISO(new Date(today.getFullYear(), qi * 3, 1));
  const end = toISO(new Date(today.getFullYear(), qi * 3 + 3, 0));
  return { start, end };
}

/**
 * Returns { start, end } ISO date strings for a given range key.
 * Supported keys: 'today', 'this_week', 'this_month', 'this_quarter', 'week', 'month', 'quarter'
 * Both `this_week` and `week` return Monday-based week bounds (normalized).
 */
function getTimeRangeBounds(range: string, now?: Date): TimeBounds | null {
  const today = now || new Date();
  const todayStr = toISO(today);

  switch (range) {
    case 'today':
      return { start: todayStr, end: todayStr };
    case 'this_week':
    case 'week':
      return weekBounds(today);
    case 'this_month':
    case 'month':
      return monthBounds(today);
    case 'this_quarter':
    case 'quarter':
      return quarterBounds(today);
    default:
      return null;
  }
}

/**
 * Check if a date range (startDate..endDate) overlaps with a time range.
 * Used by Goals and Projects pages which filter by date range overlap.
 */
export function isDateRangeInTimeRange(startDate: string | null | undefined, endDate: string | null | undefined, range: string): boolean {
  const bounds = getTimeRangeBounds(range);
  if (!bounds) return true;
  if (!startDate || !endDate) return false;
  // Overlap: item.start <= bounds.end && item.end >= bounds.start
  return startDate <= bounds.end && endDate >= bounds.start;
}

/**
 * Check if a single date falls within a time range.
 * Used by Tasks page which filters by dueDate (single date point).
 */
function isDateInTimeRange(dateStr: string | null | undefined, range: string): boolean {
  if (!dateStr) return false;
  const bounds = getTimeRangeBounds(range);
  if (!bounds) return true;
  return dateStr >= bounds.start && dateStr <= bounds.end;
}
