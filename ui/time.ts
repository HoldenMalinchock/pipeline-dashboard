export const relativeTime = (iso: string, now = Date.now()): string => {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const delta = Math.max(0, now - then);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < minute) return "just now";
  if (delta < hour) return `${Math.floor(delta / minute)}m ago`;
  if (delta < day) return `${Math.floor(delta / hour)}h ago`;
  const days = Math.floor(delta / day);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
};

export const shortSha = (sha: string): string => sha.slice(0, 8);
