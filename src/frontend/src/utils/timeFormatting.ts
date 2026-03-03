export function parseDotNetTimeSpanToSeconds(timeSpan: string | null): number | null {
  if (!timeSpan) return null;

  const parts = timeSpan.split(":");
  if (parts.length < 2) return null;

  let totalHours = 0;
  const hourPart = parts[0];
  if (hourPart.includes(".")) {
    const [days, hours] = hourPart.split(".");
    const parsedDays = Number.parseInt(days, 10);
    const parsedHours = Number.parseInt(hours, 10);
    if (Number.isNaN(parsedDays) || Number.isNaN(parsedHours)) return null;
    totalHours = parsedDays * 24 + parsedHours;
  } else {
    const parsedHours = Number.parseInt(hourPart, 10);
    if (Number.isNaN(parsedHours)) return null;
    totalHours = parsedHours;
  }

  const minutes = Number.parseInt(parts[1], 10);
  if (Number.isNaN(minutes)) return null;

  const seconds = parts.length >= 3 ? Number.parseFloat(parts[2]) : 0;
  if (Number.isNaN(seconds)) return null;

  return totalHours * 3600 + minutes * 60 + seconds;
}

export function parseDotNetTimeSpanToMilliseconds(timeSpan: string | null): number | null {
  const seconds = parseDotNetTimeSpanToSeconds(timeSpan);
  return seconds == null ? null : seconds * 1000;
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}
