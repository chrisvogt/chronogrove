/**
 * Goodreads book titles often include parenthetical series/volume tags like
 * "(The Book of Dust, #2)". The Google Books volumes API commonly returns
 * **400 Bad Request** for `intitle:` queries that contain those characters,
 * even though the same titles work in the web UI.
 *
 * Strip trailing parenthetical segments and volume markers so `intitle:` +
 * `inauthor:` fallback searches stay within what the API accepts.
 */
export const simplifyTitleForGoogleBooksQuery = (raw: string): string => {
  let t = raw.trim().replace(/\s+/g, ' ')
  while (/\s*\([^)]+\)\s*$/.test(t)) {
    t = t.replace(/\s*\([^)]+\)\s*$/, '').trim()
  }
  t = t.replace(/\s*#\d+\s*$/i, '').trim()
  if (t.length > 200) {
    t = t.slice(0, 200).trim()
  }
  return t
}
