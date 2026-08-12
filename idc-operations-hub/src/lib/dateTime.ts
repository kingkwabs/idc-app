const calendarDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const easternDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/New_York",
});

const easternDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
  timeZoneName: "short",
});

export function parseApiTimestamp(value: string): Date {
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(hasTimeZone ? value : `${value}Z`);
}

export function formatCalendarDate(
  value?: string | null,
  emptyLabel = "Date not recorded",
): string {
  if (!value) return emptyLabel;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "Date unavailable";

  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? "Date unavailable" : calendarDateFormatter.format(date);
}

export function formatEasternDate(
  value?: string | null,
  emptyLabel = "Date not recorded",
): string {
  if (!value) return emptyLabel;
  const date = parseApiTimestamp(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : easternDateFormatter.format(date);
}

export function formatEasternDateTime(
  value?: string | null,
  emptyLabel = "Date not recorded",
): string {
  if (!value) return emptyLabel;
  const date = parseApiTimestamp(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : easternDateTimeFormatter.format(date);
}
