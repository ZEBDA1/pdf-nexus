import { describe, it, expect } from 'vitest';
import { downloadFileUrl, shouldOpenDownload } from '../src/background/downloads';
describe('Ouverture des téléchargements', () => {
  const item = {
    id: 1,
    state: 'complete',
    exists: true,
    danger: 'safe',
    mime: 'application/pdf',
    filename: 'C:\\Downloads\\rapport.pdf',
    url: 'https://example.org/download',
  } as chrome.downloads.DownloadItem;
  it('ouvre seulement les PDF complets et sûrs provenant de l’extérieur', () => {
    expect(shouldOpenDownload(item, 'nexus')).toBe(true);
    for (const patch of [
      { state: 'in_progress' },
      { exists: false },
      { danger: 'file' },
      { byExtensionId: 'nexus' },
      { url: 'blob:chrome-extension://nexus/123' },
      { filename: 'a.zip', mime: 'application/zip' },
    ])
      expect(
        shouldOpenDownload({ ...item, ...patch } as chrome.downloads.DownloadItem, 'nexus'),
      ).toBe(false);
  });
  it('encode les noms locaux sans transformer # et ? en fragments ou paramètres', () => {
    expect(downloadFileUrl('C:\\Dossier\\été #1.pdf')).toBe(
      'file:///C:/Dossier/%C3%A9t%C3%A9%20%231.pdf',
    );
    expect(downloadFileUrl('/tmp/a?b.pdf')).toBe('file:///tmp/a%3Fb.pdf');
    expect(() => downloadFileUrl('https://example.org/a.pdf')).toThrow();
    expect(() => downloadFileUrl('\\\\server\\share\\a.pdf')).toThrow();
  });
});
