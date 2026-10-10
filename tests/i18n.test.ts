import { afterEach, it, expect } from 'vitest';
import { t, setLanguage } from '../src/i18n';
import { extractiveAnswer } from '../src/ai';
import { validateBytes, parsePages, errorMessage, fileSize } from '../src/utils/files';
afterEach(() => setLanguage('fr'));
it('traduit les erreurs à paramètres et normalise les erreurs réseau/PDF', () => {
  setLanguage('en');
  expect(() => parsePages('8', 2)).toThrow('Pages must be between 1 and 2.');
  expect(() => validateBytes('test.exe', new Uint8Array([1]), ['pdf', 'png'])).toThrow(
    'Unsupported format. Supported formats: pdf, png.',
  );
  expect(errorMessage(new TypeError('Failed to fetch'))).toContain('Unable to connect');
  const badPdf = new Error('Invalid PDF structure');
  badPdf.name = 'InvalidPDFException';
  expect(errorMessage(badPdf)).toBe('This PDF is invalid or damaged.');
  expect(fileSize(1.5 * 1024 * 1024)).toBe('1.5 MiB');
  setLanguage('fr');
  expect(fileSize(1.5 * 1024 * 1024)).toBe('1,5 Mio');
});
it('traduit les libellés et interpole les valeurs sans interpréter le contenu fourni', () => {
  setLanguage('en');
  expect(t('Remplir et signer')).toBe('Fill and sign');
  expect(t('Retirer {name}', { name: '<b>{name}</b>.pdf' })).toBe('Remove <b>{name}</b>.pdf');
  setLanguage('fr');
  expect(t('Page {page}. Déplacer avec Alt+flèche.', { page: 2 })).toBe(
    'Page 2. Déplacer avec Alt+flèche.',
  );
});
it('reconnaît les demandes anglaises sans prétendre reformuler en mode extractif', () => {
  setLanguage('en');
  const pages = [
    { page: 1, text: 'This sentence is long enough to be summarized. It is evidence.', items: [] },
  ];
  expect(extractiveAnswer(pages, 'Summarize the document')).toContain('Extractive summary');
  expect(extractiveAnswer(pages, 'Explain a selected passage')).toContain(
    'requires a generative model',
  );
  expect(extractiveAnswer([], 'Summarize the document')).toContain('No usable text');
});
