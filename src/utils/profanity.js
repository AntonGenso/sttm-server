/**
 * Mirrors step-to-the-moon `src/services/profanity.ts` and sttm-admin
 * `src/utils/profanity.ts` — the client checks are UX, this is what actually
 * protects the endpoints.
 *
 * Profanity check for the free-text fields people fill in about themselves
 * (nickname, account name, city and school names).
 *
 * The hard part is obfuscation: "ж0па", "ж.о.п.а", "хуууй", "zhopa" and "f*ck"
 * have to be caught as readily as the plain spelling. Off-the-shelf filters
 * (leo-profanity among them) compare whole words verbatim and see none of
 * those, so the text is first folded into a canonical form:
 *
 *   1. lower case, accents dropped
 *   2. leet characters mapped to letters       0 -> o, @ -> a, 3 -> e, $ -> s
 *   3. everything that is not a letter dropped ("ж.о.п.а" -> "жопа")
 *   4. Cyrillic transliterated to Latin        ("жопа" -> "jopa")
 *   5. Latin romanizations folded the same way ("zhopa" -> "jopa")
 *   6. runs of one letter collapsed            ("хуууй" -> "хуй")
 *
 * The word lists go through the very same function, so listing a word once
 * covers all of its disguises. What stays genuinely ambiguous is expanded into
 * variants instead, and a hit in any variant counts:
 *
 *   "y" is both у and й      -> huy and xyi both reach "hui"
 *   "c" is both ц and с      -> cyka reaches "suka"
 *   "*" hides a letter       -> f*ck reaches "fuck"
 */

const { ROOTS, EXACT, ALLOWLIST } = require("./profanityWords");

/** A root shorter than this matches too much to be usable as a substring. */
const MIN_ROOT_LENGTH = 3;

/** Stands for "a letter was masked here" until `variants` expands it. */
const MASK = "\u0001";

/** At most this many masks get expanded; beyond that they are just dropped. */
const MAX_MASKS = 2;

// Digits and symbols commonly substituted for letters.
const LEET = {
  0: "o",
  1: "i",
  3: "e",
  4: "a",
  5: "s",
  6: "b",
  7: "t",
  8: "b",
  9: "g",
  "@": "a",
  $: "s",
  "!": "i",
  "+": "t",
  "(": "c",
  ")": "c",
  "|": "i",
  "*": MASK,
  "#": MASK,
  "%": MASK,
};

// Sounds written with two Latin letters keep both letters, so "ш" and "sh"
// (or "ч" and "ch") stay distinct from plain "s" and "c": folding them down to
// a single letter turns "shit" into "sit" and starts hitting names like
// "Sitora".
const CYRILLIC = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "j",
  з: "z",
  и: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "c",
  ч: "ch",
  ш: "sh",
  щ: "sh",
  ъ: "",
  ы: "i",
  ь: "",
  э: "e",
  ю: "u",
  я: "a",
  // Uzbek and other Cyrillic extensions
  ў: "u",
  қ: "q",
  ғ: "g",
  ҳ: "h",
  ә: "a",
  і: "i",
  ї: "i",
  є: "e",
  ґ: "g",
};

// Latin lookalikes for Cyrillic letters.
const LATIN_FOLD = { x: "h", w: "v" };

// Romanizations standing for a single Cyrillic letter. Only the unambiguous
// ones — "sh" and "ch" are deliberately absent, see the note above.
const DIGRAPHS = [
  ["zh", "j"],
  ["kh", "h"],
  ["yo", "e"],
  ["yu", "u"],
  ["ya", "a"],
];

// Letters that survive folding with more than one reading.
const AMBIGUOUS = [
  ["y", ["i", "u"]],
  ["c", ["c", "s"]],
];

const isLetter = (char) => /\p{L}/u.test(char);

const collapseRepeats = (str) => str.replace(/(.)\1+/g, "$1");

/**
 * Folds text into the canonical form described above. Ambiguous and masked
 * letters are left in place for `variants` to expand.
 *
 * @param {string} str
 * @returns {string}
 */
const fold = (str) => {
  const lowered = str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  let out = "";
  for (const char of lowered) {
    if (char in LEET) out += LEET[char];
    else if (isLetter(char)) out += char;
    // everything else (spaces, dots, dashes, apostrophes) is dropped
  }

  out = out.replace(/[\u0400-\u04ff]/g, (char) =>
    char in CYRILLIC ? CYRILLIC[char] : char,
  );

  for (const [digraph, letter] of DIGRAPHS) {
    out = out.split(digraph).join(letter);
  }

  out = out.replace(/[xw]/g, (char) => LATIN_FOLD[char]);

  return collapseRepeats(out);
};

/**
 * Replaces every occurrence of `letter` with each of `readings`, leaving the
 * input untouched when the letter does not occur.
 *
 * @private
 * @param {Array.string} strs
 * @param {string} letter
 * @param {Array.string} readings
 * @returns {Array.string}
 */
const expand = (strs, letter, readings) => {
  if (!strs.some((str) => str.includes(letter))) return strs;

  return strs.flatMap((str) =>
    readings.map((reading) => collapseRepeats(str.split(letter).join(reading))),
  );
};

/**
 * Every reading of the folded text: a single entry unless it contains an
 * ambiguous or a masked letter.
 *
 * @param {string} str
 * @returns {Array.string}
 */
const variants = (str) => {
  const folded = fold(str);
  const maskCount = folded.split(MASK).length - 1;

  let results =
    maskCount > MAX_MASKS
      ? [folded.split(MASK).join("")]
      : expand([folded], MASK, ["", "a", "e", "i", "o", "u"]);

  for (const [letter, readings] of AMBIGUOUS) {
    results = expand(results, letter, readings);
  }

  return [...new Set(results)].filter(Boolean);
};

/** The word lists, folded once at load time exactly like user input is. */
const foldedRoots = [
  ...new Set(ROOTS.map(fold).filter((root) => root.length >= MIN_ROOT_LENGTH)),
];
const foldedExact = new Set(EXACT.map(fold).filter(Boolean));
const foldedAllowlist = new Set(ALLOWLIST.map(fold).filter(Boolean));

const isAllowed = (word) =>
  variants(word).some((form) => foldedAllowlist.has(form));

/**
 * Whether the text contains profanity in Russian, Uzbek or English, including
 * the usual disguises.
 *
 * @example
 * containsProfanity('Иван Петров');  // false
 * containsProfanity('ж0па');         // true
 * containsProfanity('ж.о.п.а');      // true
 *
 * @param {string} str
 * @returns {boolean}
 */
const containsProfanity = (str) => {
  if (typeof str !== "string" || !str.trim()) return false;

  const words = str.split(/[^\p{L}\p{N}*#%@$!+|]+/u).filter(Boolean);

  // Words as typed, for the entries that are only safe as whole words.
  for (const word of words) {
    if (isAllowed(word)) continue;
    if (variants(word).some((form) => foldedExact.has(form))) return true;
  }

  // The whole field with its separators removed, so "ж.о.п.а" and "ж о п а"
  // read as one word again. Allowlisted words are taken out first: they are
  // known-good, and leaving them in lets their letters form a root together
  // with a neighbour.
  const whole = variants(words.filter((word) => !isAllowed(word)).join(""));

  if (whole.some((form) => foldedExact.has(form))) return true;

  return whole.some((form) => foldedRoots.some((root) => form.includes(root)));
};

module.exports = { containsProfanity, fold, variants, foldedRoots };
