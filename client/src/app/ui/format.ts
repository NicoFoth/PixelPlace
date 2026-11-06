/** Names for the default palette, for tooltips and screen readers. */
const COLOR_NAMES: Record<string, string> = {
  '#FFFFFF': 'White',
  '#999999': 'Grey',
  '#000000': 'Black',
  '#9C6926': 'Brown',
  '#FF355E': 'Red',
  '#FD5B78': 'Pink',
  '#FF6037': 'Red orange',
  '#FF9933': 'Orange',
  '#FFFF66': 'Yellow',
  '#CCFF00': 'Lime',
  '#66FF66': 'Green',
  '#16D0CB': 'Teal',
  '#50BFE6': 'Sky blue',
  '#2450A4': 'Dark blue',
  '#9C27B0': 'Purple',
  '#FF00CC': 'Magenta',
};

export function colorName(hex: string): string {
  return COLOR_NAMES[hex.toUpperCase()] ?? hex.toUpperCase();
}

/** "0:42", "12:05" — rounds up so the countdown never shows 0:00 while waiting. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "just now", "3 minutes ago", "yesterday" … */
export function formatRelativeTime(timestamp: number, now = Date.now(), locale?: string): string {
  const seconds = Math.round((timestamp - now) / 1000);
  if (Math.abs(seconds) < 45) return 'just now';
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(Math.round(seconds / 60), 'minute');
}

/** "4×", "0.5×", "12.5×" */
export function formatZoom(zoom: number): string {
  const rounded =
    zoom >= 10
      ? Math.round(zoom)
      : zoom >= 1
        ? Math.round(zoom * 10) / 10
        : Math.round(zoom * 100) / 100;
  return `${rounded}×`;
}
