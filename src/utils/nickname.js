// Mirrors the client validator in step-to-the-moon (frontend
// `src/services/validators.ts`) — the client checks are UX, this is what
// actually protects the endpoint. Game nicknames double as the login handle:
// latin and Cyrillic letters, digits and underscore, plus single spaces
// between words so a full name ("John Connor", "Иван Петров") is a valid
// nickname. Leading/trailing spaces are trimmed, repeated ones rejected.
const { containsProfanity } = require("./profanity");

const NICKNAME_WORD = "[A-Za-z\\u0400-\\u04FF0-9_]+";
const NICKNAME_REGEX = new RegExp(`^${NICKNAME_WORD}(?: ${NICKNAME_WORD})*$`);
const NICKNAME_MIN_LENGTH = 2;
const NICKNAME_MAX_LENGTH = 32;

/** True when the trimmed nickname has an acceptable shape. */
const isValidNickname = (nickname) => {
  if (typeof nickname !== "string") return false;
  const trimmed = nickname.trim();
  return (
    trimmed.length >= NICKNAME_MIN_LENGTH &&
    trimmed.length <= NICKNAME_MAX_LENGTH &&
    NICKNAME_REGEX.test(trimmed)
  );
};

/** True when the nickname carries profanity, disguised spellings included. */
const isProfaneNickname = (nickname) =>
  typeof nickname === "string" && containsProfanity(nickname);

module.exports = {
  NICKNAME_REGEX,
  NICKNAME_MIN_LENGTH,
  NICKNAME_MAX_LENGTH,
  isValidNickname,
  isProfaneNickname,
};
