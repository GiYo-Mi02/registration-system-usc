/** Escape a cell's contents; callers wrap the result in CSV quotes. */
export function escapeCsvValue(value: unknown): string {
  const text = String(value ?? "");
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return safe.replace(/"/g, '""');
}
