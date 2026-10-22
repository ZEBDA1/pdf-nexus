import { createHash } from 'node:crypto';

const objectCreateMarker = '// MODULE: ./node_modules/core-js/internals/object-create.js';
const objectCreateSha256 = 'd0fe116345e94b964772e8d5d9d894c86721e06d8b915d3581bce0656d755a82';

/**
 * PDF.js 6.4.299's compatibility build supports browsers older than our Chrome
 * 131 minimum. Keep its recent-API polyfills, but remove the entire obsolete
 * Object.create implementation, including its ActiveX / script-writing fallback.
 * Object.create is native in every supported browser (and in Web Workers).
 * Check the upstream module byte-for-byte: upgrades must be reviewed explicitly.
 * This changes executable logic, rather than renaming or hiding flagged strings.
 */
export function pdfJsForChrome(source) {
  const start = source.indexOf(objectCreateMarker);
  const end = source.indexOf('// MODULE:', start + objectCreateMarker.length);
  if (start < 0 || end < 0 || source.indexOf(objectCreateMarker, start + 1) >= 0)
    throw new Error('PDF.js : module Object.create absent ou ambigu. Revoir la dépendance.');
  const module = source.slice(start, end);
  if (createHash('sha256').update(module).digest('hex') !== objectCreateSha256)
    throw new Error('PDF.js : le module Object.create a changé. Revoir la dépendance.');
  return (
    source.slice(0, start) +
    `${objectCreateMarker}
// PDF Nexus: native implementation for Chrome / Edge 131+.
// The obsolete browser fallback is intentionally removed; see vendor/BUILD-NOTES.txt.
var object_create_namespaceFn = /*#__PURE__*/__webpack_require__.cw(function(module) {
  module.exports = Object.create;
});

` +
    source.slice(end)
  );
}

export const remoteCodePatterns = [
  /cdn\.jsdelivr\.net/i,
  /unpkg\.com/i,
  /cdnjs\.cloudflare\.com/i,
  /workerBlobURL/i,
  /new\s+Blob\s*\(\s*\[[^\]]*importScripts/is,
  /importScripts\s*\(\s*["'`]https?:/i,
  /\.importScripts\s*\(\s*[a-z_$][\w$]*\s*\)/i,
  /new\s+Worker\s*\(\s*["'`]https?:/i,
];

// These checks prevent the specific rejected legacy routines from returning.
// IE_PROTO alone is not rejected: Lodash uses it only to detect third-party shims.
// Minification alone is allowed by the Store and is not classified as obfuscation.
export const legacyCodePatterns = [
  /\bActiveXObject\b/,
  /\bNullProtoObjectVia(?:ActiveX|IFrame)\b/,
  /(["'`])java\1\s*\+\s*[\w$]+\s*\+\s*(["'`]):\2/,
];

export function auditExecutable(name, source) {
  const failures = [];
  for (const [reason, patterns] of [
    ['Code distant', remoteCodePatterns],
    ['Repli de navigateur obsolète', legacyCodePatterns],
  ]) {
    for (const pattern of patterns)
      if (pattern.test(source)) failures.push(`${name} : ${reason} (${pattern})`);
  }
  return failures;
}
