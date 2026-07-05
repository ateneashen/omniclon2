/** Join a directory path and filename using the platform separator inferred from `dir`. */
export function joinPath(dir: string, filename: string): string {
  const sep = dir.includes('\\') ? '\\' : '/';
  return `${dir.replace(/[\\/]+$/, '')}${sep}${filename}`;
}

/** `CAPTURA_yymmddhhmmss.png` using local time. */
export function captureFilename(date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yy = pad(date.getFullYear() % 100);
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const HH = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `CAPTURA_${yy}${MM}${dd}${HH}${mm}${ss}.png`;
}
