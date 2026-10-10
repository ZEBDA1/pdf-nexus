export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export function validateBytes(name: string, bytes: Uint8Array, accepted: string[] = ['pdf']) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (!accepted.includes(ext))
    throw new Error(
      t('Format non pris en charge. Formats : {formats}.', { formats: accepted.join(', ') }),
    );
  if (!bytes.length) throw new Error('Le fichier est vide.');
  if (bytes.length > MAX_FILE_BYTES) throw new Error('Le fichier dépasse la limite de 50 Mio.');
  const header = new TextDecoder().decode(bytes.slice(0, 1024));
  if (ext === 'pdf' && !header.includes('%PDF-'))
    throw new Error('Ce fichier ne contient pas une signature PDF valide.');
  if (ext === 'png' && ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v))
    throw new Error('Image PNG invalide.');
  if (['jpg', 'jpeg'].includes(ext) && (bytes[0] !== 255 || bytes[1] !== 216))
    throw new Error('Image JPEG invalide.');
  if (ext === 'docx' && (bytes[0] !== 80 || bytes[1] !== 75))
    throw new Error('Archive DOCX invalide.');
  return ext;
}
export async function readFile(file: File, accepted?: string[]) {
  if (file.size > MAX_FILE_BYTES) throw new Error('Le fichier dépasse la limite de 50 Mio.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  validateBytes(file.name, bytes, accepted);
  return { name: file.name, bytes };
}
export function fileSize(n: number) {
  return n < 1024 * 1024
    ? t('{size} Kio', { size: Math.round(n / 1024).toLocaleString(getLocale()) })
    : t('{size} Mio', {
        size: (n / 1024 / 1024).toLocaleString(getLocale(), {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }),
      });
}
export function safeName(name: string) {
  return (
    name
      .replace(/\.[^.]+$/, '')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .slice(0, 100) || 'document'
  );
}
export function download(bytes: Uint8Array | Blob, name: string, mime = 'application/pdf') {
  const blob =
    bytes instanceof Blob ? bytes : new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
export function safeUrl(value: string) {
  const u = new URL(value);
  if (!['https:', 'http:', 'mailto:'].includes(u.protocol))
    throw new Error('Lien : utilisez https, http ou mailto.');
  return u.href;
}
export function parsePages(value: string, count: number): number[] {
  if (!value.trim()) return Array.from({ length: count }, (_, i) => i);
  const result: number[] = [];
  for (const token of value.split(',')) {
    const m = token.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) throw new Error('Pages invalides. Exemple : 1, 3-5.');
    const first = Number(m[1]),
      last = Number(m[2] ?? m[1]);
    if (first < 1 || last > count || first > last)
      throw new Error(t('Les pages doivent être comprises entre 1 et {count}.', { count }));
    for (let i = first; i <= last; i++) if (!result.includes(i - 1)) result.push(i - 1);
  }
  return result;
}
export const uid = () => crypto.randomUUID();
export function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Opération annulée', 'AbortError');
}
export function errorMessage(error: unknown) {
  if (!(error instanceof Error)) return t('Une erreur est survenue.');
  if (error.name === 'AbortError') return t('Opération annulée.');
  if (error.name === 'PasswordException')
    return t('Mot de passe incorrect ou requis pour lire ce PDF.');
  if (error.name === 'InvalidPDFException') return t('Ce PDF est invalide ou endommagé.');
  if (error.name === 'MissingPDFException') return t('Le fichier PDF est introuvable.');
  if (error.name === 'QuotaExceededError')
    return t('Le stockage local est plein. Supprimez des fichiers récents puis réessayez.');
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message))
    return t('Connexion impossible. Vérifiez le réseau et l’adresse, puis réessayez.');
  return t(error.message || 'Une erreur est survenue.');
}
import { t, getLocale } from '../i18n';
