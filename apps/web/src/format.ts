const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * A `YYYY-MM-DD` calendar date as a human label, e.g. `4 Jan 2027`. Formatted
 * from the parts rather than `new Date(iso)`, which would shift by a day in
 * negative-UTC-offset timezones.
 */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  const name = month ? MONTHS[Number(month) - 1] : undefined;
  if (!year || !name || !day) {
    return iso;
  }
  return `${Number(day)} ${name} ${year}`;
}
