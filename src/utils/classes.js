const crypto = require("crypto");

const CODE_LENGTH = 7;

/**
 * No 0/O/1/I/L: the code is meant to be dictated out loud and typed by a child,
 * so characters that look alike are left out entirely.
 */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const GRADE_MIN = 1;
const GRADE_MAX = 11;

// Cyrillic and latin letters are different codepoints, so «А» and "A" never
// collide in the unique index — `alphabet` only records which set was picked.
const CYRILLIC_LETTER = /^[А-ЯЁ]$/;
const LATIN_LETTER = /^[A-Z]$/;

/** `crypto.randomBytes` over a 31-char alphabet: ~2.7e10 possible codes. */
const generateInviteCode = () =>
  Array.from(
    crypto.randomBytes(CODE_LENGTH),
    (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length],
  ).join("");

/** Students paste codes with spaces and in lower case; both are accepted. */
const normalizeInviteCode = (value) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, "").toUpperCase() : "";

const isValidInviteCode = (code) =>
  code.length === CODE_LENGTH &&
  [...code].every((char) => CODE_ALPHABET.includes(char));

const parseGrade = (value) => {
  const grade = Number(value);
  return Number.isInteger(grade) && grade >= GRADE_MIN && grade <= GRADE_MAX
    ? grade
    : null;
};

/**
 * Returns `{ letter, alphabet }` for a single latin or cyrillic letter, or null
 * for anything else. The alphabet is derived from which script the letter is in.
 */
const parseLetter = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const letter = value.trim().toUpperCase();

  if (CYRILLIC_LETTER.test(letter)) {
    return { letter, alphabet: "cyrillic" };
  }
  if (LATIN_LETTER.test(letter)) {
    return { letter, alphabet: "latin" };
  }
  return null;
};

/**
 * Key for the school unique index: «Школа №12», "школа 12" and "  Школа  № 12 "
 * all collapse to `школа 12`, so the same school is not created twice.
 */
const normalizeSchoolName = (value) =>
  value
    .toLowerCase()
    .replace(/[№#"'`»«.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

module.exports = {
  CODE_LENGTH,
  GRADE_MIN,
  GRADE_MAX,
  generateInviteCode,
  normalizeInviteCode,
  isValidInviteCode,
  parseGrade,
  parseLetter,
  normalizeSchoolName,
};
