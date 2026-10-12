# PDF Nexus — installation and user guide

PDF Nexus is a free Chrome and Microsoft Edge extension for reading, editing, organizing, converting and analyzing PDFs. No advertising, tracking or proprietary subscription. Local features work offline once the extension has been built. Remote AI is optional and its provider may charge you.

## Install or update

1. Build the project, or extract `release/pdf-nexus-1.6.7.zip`.
2. Open `chrome://extensions` or `edge://extensions` and enable Developer mode.
3. Choose **Load unpacked** and select the `dist` folder (or extracted archive folder) containing `manifest.json`.
4. Choose your language and light, dark or system theme in the initial setup. You can change them in Settings.
5. After updating the files, export any draft, reload the extension on the extensions page, and reopen its editor.

The extension requires Chromium 131 or later. It opens a full editor in a browser tab and has a compact toolbar popup. It does not change the Windows default PDF application.

## Use Nexus for PDF links and local files

Settings has separate controls for web links, local PDF tabs and new downloads.

From the popup, first-time web access opens a dedicated activation tab. Click its activation button and confirm the browser prompt. Existing access is reused without asking again. Nexus checks that the background PDF detector is available before reporting activation. A request that never completes produces an explicit error instead of an endless spinner. Version 1.6.5 replaces rule installation with a non-blocking PDF response observer. Enable web opening again after updating and accept the new optional `webRequest` permission, even if website access was already granted. No blocking permission is requested. The browser viewer may briefly appear before Nexus takes over. The user has confirmed both local and web PDF opening in their regular Chrome profile with version 1.6.5.

- **Enable web PDF opening** requests optional HTTP(S) website access and PDF response detection. Successful GET navigations with the PDF MIME type open Nexus in the same tab, including URLs without a suffix. HTML pages named `.pdf` and embedded PDF frames stay on their website. Attachments follow the separate download setting. Reload a PDF already displayed in the browser's viewer, or use **Open this tab's PDF in Nexus** in the popup.
- **Open local PDFs in Nexus** takes over PDFs opened through Ctrl+O, dragging a PDF into the browser, or a local `file:` URL. Enable **Allow access to file URLs** in the extension's browser details as well. Settings shows the missing step and provides a link to it.
- **Also open downloaded PDFs** opens the completed local copy in a Nexus tab. The original download is kept. PDFs exported by Nexus are not reopened automatically.

Permissions are optional and no site or file access is granted on installation. A missing or revoked permission is shown explicitly; use **Restore permission** when offered. File access remains available if either local-tab opening or download opening still needs it. Revoking **all website and file access** affects both AI providers and automatic opening.

Authenticated web PDFs, POST requests, `blob:` URLs, network-share paths, missing files or unrecognized MIME types may require downloading and importing the PDF manually. The browser's file-access toggle cannot be enabled silently by the extension.

## Read and edit

Open or drop a PDF. The editor starts in text-editing mode. Click a passage or select text within one block and type directly on the page. Changes enter the draft as you type; exporting does not require a separate Apply action. The floating toolbar controls font, size and fitting. The move handle beside the text supports dragging or arrow keys; Shift increases the step.

Supported native text is rewritten in the PDF content stream. Unsupported selectable text uses a clearly labelled **visual correction** with an estimated background and a replacement font. **The original content remains underneath a visual correction.** This is not secure redaction. Layout, font matching and fitting are approximate, and neighboring paragraphs do not reflow. Scanned pages require OCR or added text. Some moved passages may only support visual correction after export and reimport.

**Read** lets you select/copy text and move annotations. **Add text** creates a text field where you click. **Annotate** groups highlights, drawing, shapes, notes, links, stamps and images. **Edit all text** opens the current page's text list. Undo/redo works on the draft; ordinary text-field undo and document-history undo have different scopes.

Zoom buttons, Ctrl+wheel, Ctrl+/−/0 and browser-tab zoom affect the PDF while the controls retain their size. Use the hand tool or middle mouse button to pan. Thumbnails support drag reordering or Alt+arrow keys, rotation, duplication, insertion and deletion. Document tools provide merge, split and selected-page export, watermarks, page numbers and metadata controls.

Drafts live in memory: **export before closing or reloading the tab**. Recent files retain the original document, not an autosaved edited draft.

## Fill and sign

**Fill and sign → Sign** creates a signature from drawing or a typed name, entirely on the device. Click the page to place it and use Read to move it. The signature is a PNG image, without a digital certificate or a persistent signature library.

After placing a signature, selection mode activates automatically. Drag the signature directly. The floating object settings do not push the page during movement. Pointer capture keeps movement working even if the pointer briefly leaves the page. Undo/redo restores complete moves.

Supported PDF checkboxes can be checked or unchecked directly. **Detect checkboxes** proposes empty printed squares on visible pages; click a candidate to toggle it. Detection is approximate and may miss rounded, filled, touching or poor-quality boxes. You can also add a checkbox manually from Annotate.

Export flattens supported original form appearances and the current checkbox choices into a new PDF. Original interactive fields, digital signatures, actions and scripts are not preserved.

## Convert and recognize text

The converter produces real TXT, DOCX, HTML, XLSX, PNG, JPEG or PDF files. Multiple image outputs are packaged in a ZIP. Images, TXT and DOCX can be converted to PDF, and multiple files can be merged.

- PDF to Word/HTML is text reconstruction, not a faithful visual-layout conversion.
- Word to PDF extracts the text and lays it out simply; images and complex formatting are not reproduced.
- Excel extraction requires regular tables with at least three aligned rows and two columns. Complex or scanned tables may be rejected.
- Image compression rasterizes the PDF and removes selectable text, vector content and interactive elements. File size reduction is not guaranteed.
- Local Tesseract OCR supports French and English. It extracts text for search and the assistant. Searchable PDF export uses page images plus invisible recognized text; word placement is approximate.

Open files are limited to 1,000 pages and 150 MiB total. Manual imports are limited to 50 MiB per file. Rendering is progressive, with memory limits and cancellation for processing jobs.

## Assistant and privacy

**Local excerpts**, the default, searches and selects sentences without a generative model. It does not pretend to translate or rewrite. The optional browser model depends on browser/hardware availability and may need an explicit initial download. A personal API can connect to a compatible Chat Completions endpoint.

Remote requests require confirmation. They send selected excerpts (up to ten pages / 26,000 characters) and the last six conversation messages to the chosen provider. Check its charges and privacy terms. No secret key is embedded in the extension. Personal keys are stored in Chrome Storage Session, limited to trusted extension contexts; this is not a hardware-encrypted vault. Requests reject redirects and do not send cookies. AI replies have no tool or file-system access and must be verified against the cited pages.

Recent files and conversations are stored locally only when enabled. Limits: ten recent files, 100 MiB total. Clearing local data removes recent files, conversations, pending popup transfers and the API key, and closes the draft. It does not delete downloaded files, OS backups or data already sent to a provider. Disable/revoke permissions separately when desired.

There is no secure redaction, universal native text editing, password encryption/decryption or digital certificate signing. Removing Info/XMP metadata does not remove personal information elsewhere in a document. PDF JavaScript and XFA are not executed. Malformed documents can still consume resources; keep the browser and dependencies updated.

## Build, test and extend

Node.js 24 LTS and npm 11 are recommended. All exact package versions are in `package-lock.json`.

```powershell
npm ci
npm run assets
npm run dev
npm run check
npm run test:e2e
```

Development opens at `http://127.0.0.1:5173/editor.html`. Chrome permissions and the popup require testing the installed production extension. `npm run check` audits translation keys, runs unit tests, checks TypeScript, builds the extension and creates install/source ZIP archives. Playwright tests require their browser runtime and Edge for the Edge cases. Tests use temporary profiles; optional permission dialogs are not automated and navigation tests pregrant permissions in a disposable manifest.

Source modules: `popup`, `editor`, `components`, `pdf`, `converters`, `ocr`, `ai`, `storage`, `background`, `workers` and `utils`. `src/i18n.ts` and `src/locales/en.json` contain the application translations; `public/_locales` localizes the manifest description according to the browser language. Translation does not change PDF content, filenames, provider responses or external license notices. Technical diagnostics from external libraries may retain their original language.

The project uses React, TypeScript, Vite, PDF.js, pdf-lib, fontkit, Tesseract.js, docx, ExcelJS, fflate, xmldom, idb and Lucide. Exact licenses and notices are generated by `npm run licenses` and are available in `public/licenses.json` and the extension's About section. The full source archive includes implementation, tests, local assets, build configuration and documentation.
