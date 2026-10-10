/** Only completed, safe PDFs from outside Nexus are opened. No download is removed or retried. */
export function shouldOpenDownload(item: chrome.downloads.DownloadItem, extensionId: string) {
  return (
    item.state === 'complete' &&
    item.exists &&
    ['safe', 'accepted', 'deepScannedSafe'].includes(item.danger) &&
    (item.mime.toLowerCase().split(';')[0] === 'application/pdf' ||
      /\.pdf$/i.test(item.filename)) &&
    item.byExtensionId !== extensionId &&
    !item.url.startsWith(`blob:chrome-extension://${extensionId}/`) &&
    !item.url.startsWith(`chrome-extension://${extensionId}/`)
  );
}

export function downloadFileUrl(filename: string) {
  // Construct only from a browser DownloadItem, never from the editor URL.
  const normalized = filename.replace(/\\/g, '/');
  if (/^[a-z]:\//i.test(normalized))
    return `file:///${normalized.slice(0, 2)}/${normalized.slice(3).split('/').map(encodeURIComponent).join('/')}`;
  if (normalized.startsWith('/') && !normalized.startsWith('//'))
    return `file://${normalized.split('/').map(encodeURIComponent).join('/')}`;
  throw new Error('Chemin local non pris en charge. Ouvrez le PDF avec « Ouvrir un PDF ».');
}

export async function openDownloadedPdf(rawId: string, signal: AbortSignal) {
  if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(Number(rawId)))
    throw new Error('Téléchargement invalide.');
  if (!(await chrome.permissions.contains({ permissions: ['downloads'] })))
    throw new Error('Autorisez les téléchargements dans les paramètres de PDF Nexus.');
  const [item] = await chrome.downloads.search({ id: Number(rawId) });
  if (!item || !shouldOpenDownload(item, chrome.runtime.id))
    throw new Error('Ce téléchargement PDF n’est pas disponible.');
  if (!(await chrome.extension.isAllowedFileSchemeAccess()))
    throw new Error(
      'Dans les détails de PDF Nexus sur chrome://extensions ou edge://extensions, activez « Autoriser l’accès aux URL de fichiers », puis rechargez cet onglet. Vous pouvez aussi choisir le PDF avec « Ouvrir un PDF ».',
    );
  const response = await fetch(downloadFileUrl(item.filename), { signal, credentials: 'omit' });
  if (!response.ok || !response.body)
    throw new Error(
      'Le fichier téléchargé est inaccessible. Choisissez-le avec « Ouvrir un PDF ».',
    );
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 150 * 1024 * 1024) throw new Error('PDF trop volumineux : maximum 150 Mio.');
      chunks.push(value);
    }
  } catch (e) {
    await reader.cancel();
    throw e;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes('%PDF-'))
    throw new Error('Le fichier téléchargé n’est pas un PDF valide.');
  return { name: item.filename.split(/[\\/]/).pop() || 'document.pdf', bytes };
}
