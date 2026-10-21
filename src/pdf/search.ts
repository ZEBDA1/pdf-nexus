export function occurrences(text: string, query: string): { start: number; end: number }[] {
  if (!query.trim()) return [];
  const haystack = text.toLocaleLowerCase('fr'),
    needle = query.toLocaleLowerCase('fr');
  const result = [];
  let start = 0,
    index: number;
  while ((index = haystack.indexOf(needle, start)) >= 0) {
    result.push({ start: index, end: index + needle.length });
    start = index + needle.length;
  }
  return result;
}
