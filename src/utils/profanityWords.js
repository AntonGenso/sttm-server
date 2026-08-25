/**
 * Mirrors step-to-the-moon `src/services/profanityWords.ts` and sttm-admin
 * `src/utils/profanityWords.ts`; keep the three in sync when adding words.
 *
 * Word lists for the profanity filter.
 *
 * Two kinds of entries, because the matching rules differ:
 *
 *   ROOTS — matched as a SUBSTRING of the normalized text, so "жоп" also
 *           catches "жопка"/"жопище". Only put here what stays unambiguous
 *           inside another word; short or homographic stems ("ass", "am",
 *           "бля", "хер", "манда") hit ordinary names and belong in EXACT.
 *
 *   EXACT — matched only when a whole word equals it. Safe place for short
 *           stems and for the imported English dictionary.
 *
 *   ALLOWLIST — whole words that must never be rejected. The escape hatch for
 *           false positives reported from production: add the word here rather
 *           than weakening a root.
 *
 * Entries are written in their natural spelling (any script) and normalized at
 * load time by the same function that normalizes user input, so listing a word
 * once also covers its leet, spaced-out and transliterated variants.
 */

// English dictionary shipped by leo-profanity (Shutterstock list, 253 words).
// Imported as data only: the package's own matcher compares whole words
// verbatim and cannot see through obfuscation, which is why the normalizer and
// the matcher in ./profanity live here.
const leoEnglishDictionary = require("leo-profanity/dictionary/default.json");

const RUSSIAN_ROOTS = [
  "хуй",
  "хуё",
  "хуе",
  "хуя",
  "хую",
  "пизд",
  "ебал",
  "ебан",
  "ебат",
  "ебуч",
  "ебло",
  "ебли",
  "ёбан",
  "ёбну",
  "заеб",
  "наеб",
  "уеб",
  "поеб",
  "въеб",
  "выеб",
  "разъеб",
  "долбоёб",
  "бляд",
  "блят",
  "сучк",
  "сучар",
  "залуп",
  "мудак",
  "мудил",
  "мудоз",
  "пидор",
  "пидар",
  "пидр",
  "педик",
  "гандон",
  "гондон",
  "дроч",
  "шлюх",
  "проститут",
  "говн",
  "дерьм",
  "засран",
  "обосра",
  "жоп",
  "уёбищ",
  "ублюдок",
  "выблядок",
  "сперм",
  "минет",
  "отсос",
  "дилдо",
  "трахну",
];

// Short or homographic on purpose: "сука" sits inside "Асука", "бля" inside
// "благо", "хер" inside "Херсон", "манда" inside "мандарин".
const RUSSIAN_EXACT = [
  "сука",
  "суки",
  "суке",
  "суку",
  "сукой",
  "сук",
  "бля",
  "хер",
  "хрен",
  "манда",
  "елда",
  "анус",
  "чмо",
  "лох",
  "лошара",
  "жопа",
  "срака",
  "ссыкло",
];

// Both scripts are listed where the word is commonly written in either.
// NOTE: this list covers the widely known obscenities only and wants a review
// by a native speaker before it can be called complete.
const UZBEK_ROOTS = [
  "qotoq",
  "qo'toq",
  "qutoq",
  "қўтоқ",
  "кўток",
  "kotak",
  "ko'tak",
  "кўтак",
  "jalab",
  "жалаб",
  "qanjiq",
  "канжиқ",
  "канжик",
  "siktir",
  "sikish",
  "sikaman",
  "sikkan",
  "sikay",
  "сиктир",
  "сикиш",
  "dalbayob",
  "dolbayob",
  "далбайоб",
  "долбайоб",
  "haromi",
  "ҳароми",
  "onangni",
  "onasini",
  "enangni",
  "онангни",
  "онасини",
];

// "am" sits inside Amir/Amina/amaki/amakivachcha, "sik" inside psikolog.
const UZBEK_EXACT = ["am", "sik", "ам", "сик"];

const ENGLISH_ROOTS = [
  "fuck",
  "shit",
  "cunt",
  "nigger",
  "nigga",
  "faggot",
  "motherfuck",
  "whore",
  "blowjob",
  "handjob",
  "wank",
  "dildo",
  "pussy",
  "bitch",
  "jerkoff",
  "cumshot",
  "bollock",
  "bastard",
  "asshole",
  "arsehole",
  "dumbass",
  "jackass",
  "twat",
  "slut",
];

// Real words the substring rules would otherwise reject:
//   "скипидар"   -> skipidar contains the "пидар" root
//   "Scunthorpe" -> the classic one: contains "cunt"
//   "Чуй"        -> chui contains the "хуй" root
const ALLOWLIST = ["скипидар", "scunthorpe", "чуй", "chui", "shiitake"];

module.exports = {
  ROOTS: [...RUSSIAN_ROOTS, ...UZBEK_ROOTS, ...ENGLISH_ROOTS],
  EXACT: [...RUSSIAN_EXACT, ...UZBEK_EXACT, ...leoEnglishDictionary],
  ALLOWLIST,
};
