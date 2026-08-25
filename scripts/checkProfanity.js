#!/usr/bin/env node
/**
 * Regression check for the profanity filter (`src/utils/profanity.js`).
 *
 * Two things have to hold at once: the disguised spellings must be caught, and
 * ordinary Russian, Uzbek and English names must go through untouched — a
 * filter that rejects "Sitora" or "Amir" is worse than no filter at all. Run
 * it after every change to the word lists:
 *
 *   npm run check:profanity
 *
 * The same lists are mirrored in step-to-the-moon and sttm-admin, so this is
 * the check for all three copies.
 */

const { containsProfanity } = require("../src/utils/profanity");

const MUST_BLOCK = [
  // Russian, plain and disguised
  "жопа", "Ж0па", "ж.о.п.а", "ж о п а", "ЖОПА", "жоооопа", "zhopa", "жопка",
  "хуй", "ХуЙ", "х.у.й", "хуууй", "huy", "xyi", "hui", "нахуй", "хуево",
  "пизда", "п.и.з.д.а", "pizda", "пиздец",
  "ебать", "e6ать", "ебал", "заебал", "долбоёб", "долбоеб",
  "блядь", "бляд", "blyad", "сука", "cyka", "с.у.к.а", "сучка",
  "мудак", "пидор", "п и д о р", "гандон", "дрочить", "говно", "шлюха",
  // English
  "fuck", "f.u.c.k", "fuuuck", "f*ck", "FUCK", "fucker", "motherfucker",
  "shit", "sh1t", "bitch", "b1tch", "cunt", "asshole", "a$$hole", "nigger",
  "ass", "sex", "boob",
  // Uzbek
  "qotoq", "qo'toq", "q.o.t.o.q", "қўтоқ", "ko'tak", "kotak", "jalab",
  "siktir", "sikish", "qanjiq", "dalbayob", "onangni", "am", "sik",
];

const MUST_PASS = [
  // ordinary names and nicknames
  "Иван Петров", "John Connor", "Александр", "Алексей", "Мария", "Анна",
  "Дмитрий", "Екатерина", "Кассандра", "Cassandra", "Asuka", "Асука",
  "Amir", "Amira", "Amina", "Samir", "amakivachcha", "Jasur", "Ozodbek",
  "Shahzod", "Ulug'bek", "Nodira", "Shokir", "Feruza", "Bekzod",
  "Xurshid", "Sardor", "Aziz", "Islom", "Malika",
  "Максим", "Никита", "Владислав", "Светлана", "Роман", "Кирилл",
  "astronaut", "moonwalker", "Space_Cat", "user_2010", "Nika99",
  // words the substring rules would trip over without the allowlist
  "Скипидар", "мандарин", "Херсон", "Благо", "Кот", "котик",
  "assistant", "classic", "Scunthorpe", "analysis", "Massimo",
  "psikolog", "Sitora", "Sanjar",
];

let failures = 0;

for (const value of MUST_BLOCK) {
  if (!containsProfanity(value)) {
    console.log("MISSED (should be blocked):", JSON.stringify(value));
    failures++;
  }
}

for (const value of MUST_PASS) {
  if (containsProfanity(value)) {
    console.log("FALSE POSITIVE (should pass):", JSON.stringify(value));
    failures++;
  }
}

console.log(
  `\n${MUST_BLOCK.length} blocked + ${MUST_PASS.length} allowed cases, ` +
    `${failures} failure(s)`,
);

process.exit(failures ? 1 : 0);
