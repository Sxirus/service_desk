export function formatDate(raw) {
  const d = new Date(raw);
  return d.toLocaleString("de-DE", {
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}