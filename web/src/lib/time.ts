// Time labels shared by every page. hourLabel ALREADY ends with " UTC": callers must not add the zone again.

/** "22 Nov, 16:00 UTC". The zone suffix is part of the label; do not append another one. */
export const hourLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) + " UTC";

/** True when a string names the same zone twice in a row, with or without a comma between. Tests use it to catch a doubled suffix. */
export const hasDoubledZone = (s: string) => /\b(UTC|GMT|Z)\b[\s,]+\1\b/.test(s);
