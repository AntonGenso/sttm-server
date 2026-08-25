// Mirrors sttm-admin/src/utils/name.ts — the client checks are UX, this is what
// actually protects the endpoint. Account names double as the login handle and
// the display name: latin and Cyrillic letters plus full names with internal
// separators (space, hyphen, apostrophe) are allowed, so both "John Connor" and
// "Иван Петрович" are valid. Digits and other symbols are rejected.
const { containsProfanity } = require("./profanity");

const NAME_REGEX = /^[A-Za-zА-Яа-яЁё]+(?:[ '-][A-Za-zА-Яа-яЁё]+)*$/;
const NAME_MIN_LENGTH = 3;
const NAME_ERROR =
  "Name must be at least 3 letters (latin or Cyrillic); spaces are allowed";
const NAME_PROFANITY_ERROR = "Name contains inappropriate language";

/** Returns an error message string, or null when the name is valid. */
const validateName = (name) => {
  if (typeof name !== "string") return NAME_ERROR;
  const trimmed = name.trim();
  if (trimmed.length < NAME_MIN_LENGTH || !NAME_REGEX.test(trimmed)) {
    return NAME_ERROR;
  }
  if (containsProfanity(trimmed)) return NAME_PROFANITY_ERROR;
  return null;
};

module.exports = {
  NAME_REGEX,
  NAME_MIN_LENGTH,
  NAME_ERROR,
  NAME_PROFANITY_ERROR,
  validateName,
};
