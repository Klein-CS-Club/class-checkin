// Name search, ported from gdpt-checkin's lib/names.ts.

// Lowercase, strip accents and map đ to d, so "José" → "jose" and "Đức" → "duc".
export function normalizeName(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

const words = (name) => normalizeName(name).split(' ').filter(Boolean);

// Collapses spaces, and turns "Last, First" (common in school exports) into "First Last".
export function tidyName(raw) {
  const name = raw.replace(/\s+/g, ' ').trim();
  const parts = name.split(',').map((p) => p.trim());
  return parts.length === 2 && parts[0] && parts[1] ? `${parts[1]} ${parts[0]}` : name;
}

export const firstName =(name) => name.trim().split(/\s+/)[0];

// Every typed word must be the start of a different word of the name, in any order.
// An empty query matches everyone.
export function matchesSearch(name, query) {
  const tokens = words(query);
  if (!tokens.length) return true;
  const parts = words(name);
  if (tokens.length > parts.length) return false;

  // Names are a handful of words, so a tiny backtracking search is plenty.
  const used = parts.map(() => false);
  const assign = (i) => {
    if (i === tokens.length) return true;
    for (let w = 0; w < parts.length; w++) {
      if (used[w] || !parts[w].startsWith(tokens[i])) continue;
      used[w] = true;
      if (assign(i + 1)) return true;
      used[w] = false;
    }
    return false;
  };
  return assign(0);
}

const collator = new Intl.Collator('en', { sensitivity: 'base' });
const lastWord = (name) => name.trim().split(/\s+/).at(-1);

// Last name, then the full name, the way class lists are usually sorted.
export const compareByName = (a, b) =>
  collator.compare(lastWord(a), lastWord(b)) || collator.compare(a, b);

// Same person? Ignores case, accents and extra spaces.
export const sameName = (a, b) => normalizeName(a) === normalizeName(b);
