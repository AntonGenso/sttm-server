/**
 * Нормализация названий городов и школ — ключи, по которым справочники не
 * обрастают дублями.
 *
 * Задача у нормализации ровно одна: свести к одной строке то, что заведомо
 * означает одно и то же здание. Всё, что *может* оказаться разными школами
 * («Школа №5» и «Школа №5 им. Навои» в одном городе), она осознанно оставляет
 * разным — сливать их вправе только админ, глазами. Поэтому подсказка похожих
 * школ (`findSimilar`) работает мягче, чем ключ уникальности: она предлагает,
 * а не решает.
 */

/** Латинские омоглифы отдельно не чиним — «ё» и пунктуация дают основную долю расхождений. */
const PUNCTUATION = /[№#"'`»«„“”.,;:()[\]{}/\\+*!?_\-–—]/g;

const squash = (value) =>
  String(value)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(PUNCTUATION, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * «г. Ташкент», «Ташкент шахар» и «Ташкент» — один город. Ничего, кроме этих
 * служебных слов, из названия не выбрасывается: города вводит только админ, и
 * ключ здесь нужен как страховка от опечатки, а не как поисковый индекс.
 */
const CITY_STOP_WORDS = new Set([
  "г", "гор", "город", "города",
  "shahar", "shahri", "шахар", "шахри", "шаҳар",
  "city",
]);

const normalizeCityName = (value) =>
  squash(value)
    .split(" ")
    .filter((token) => token && !CITY_STOP_WORDS.has(token))
    .join(" ");

/**
 * Слова, которыми называют один и тот же тип учреждения на двух языках и в
 * пяти сокращениях. Гимназия, лицей и интернат сведены каждый к себе, а не к
 * «школе»: это разные учреждения, и в одном городе вполне бывают и школа №5, и
 * гимназия №5.
 */
const SCHOOL_TYPES = {
  школа: "школа",
  школы: "школа",
  школе: "школа",
  шк: "школа",
  сош: "школа",
  сш: "школа",
  моу: "школа",
  мактаб: "школа",
  мактаби: "школа",
  maktab: "школа",
  maktabi: "школа",
  school: "школа",
  умумтаълим: "школа",
  umumtalim: "школа",

  гимназия: "гимназия",
  гимназии: "гимназия",
  гимназияси: "гимназия",
  gimnaziya: "гимназия",
  gimnaziyasi: "гимназия",

  лицей: "лицей",
  лицея: "лицей",
  литсей: "лицей",
  litsey: "лицей",
  litseyi: "лицей",

  интернат: "интернат",
  internat: "интернат",

  колледж: "колледж",
  kollej: "колледж",
};

/** «имени Навои» и «им. Навои» — одно и то же уточнение. */
const WORD_SYNONYMS = { имени: "им", nomidagi: "им", номидаги: "им" };

const isNumber = (token) => /^\d+$/.test(token);

/**
 * Разбирает название на тип учреждения, номера и остальные слова.
 *
 * Порядок слов в живых названиях гуляет («5-мактаб» против «Школа №5»), поэтому
 * ключ собирается в каноническом порядке: тип, номера, всё остальное как есть.
 */
const parseSchoolName = (value) => {
  const tokens = squash(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => WORD_SYNONYMS[token] ?? token);

  let type = null;
  const numbers = [];
  const rest = [];

  for (const token of tokens) {
    const mapped = SCHOOL_TYPES[token];
    if (mapped && !type) {
      type = mapped;
      continue;
    }
    if (isNumber(token)) {
      // «05» и «5» — один номер.
      numbers.push(String(Number(token)));
      continue;
    }
    rest.push(token);
  }

  numbers.sort();
  return { type, numbers, rest };
};

/**
 * Ключ уникальности школы внутри города: «Школа №12», "школа 12", «12-мактаб»
 * и «СОШ 12» дают одно и то же `школа 12`.
 */
const normalizeSchoolName = (value) => {
  const { type, numbers, rest } = parseSchoolName(value);
  return [type, ...numbers, ...rest].filter(Boolean).join(" ");
};

const jaccard = (a, b) => {
  if (!a.size && !b.size) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }
  return shared / (a.size + b.size - shared);
};

/**
 * Похожие школы для подсказки «возможно, вы имели в виду».
 *
 * Совпавший номер весит больше всего: в пределах города номер школы и есть её
 * имя, а «им. Навои» в одном написании есть, а в другом нет. Совпадение по
 * ключу сюда не попадает — такую школу вернёт сам get-or-create.
 */
const findSimilar = (name, candidates, { limit = 5, minScore = 1.5 } = {}) => {
  const target = parseSchoolName(name);
  const targetNumbers = target.numbers.join(" ");
  const targetTokens = new Set([...target.numbers, ...target.rest]);

  return candidates
    .map((candidate) => {
      const parsed = parseSchoolName(candidate.name);
      let score = jaccard(targetTokens, new Set([...parsed.numbers, ...parsed.rest])) * 2;

      if (targetNumbers && targetNumbers === parsed.numbers.join(" ")) {
        score += 2;
      }
      if (target.type && parsed.type) {
        // Школа №12 и гимназия №12 в одном городе — разные учреждения, и
        // подсказывать одну вместо другой хуже, чем не подсказать ничего.
        score += target.type === parsed.type ? 0.5 : -1;
      }
      return { candidate, score };
    })
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.candidate);
};

module.exports = {
  normalizeCityName,
  normalizeSchoolName,
  parseSchoolName,
  findSimilar,
};
