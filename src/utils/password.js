const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72; // bcrypt ignores anything past 72 bytes

// Mirrors sttm-admin/src/utils/password.ts — the client checks are UX, this is
// what actually protects the endpoint.
const rules = [
  {
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`,
    test: (value) => value.length >= PASSWORD_MIN_LENGTH,
  },
  {
    message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters long`,
    test: (value) => value.length <= PASSWORD_MAX_LENGTH,
  },
  {
    message: "Password must contain a lowercase letter",
    test: (value) => /[a-z]/.test(value),
  },
  {
    message: "Password must contain an uppercase letter",
    test: (value) => /[A-Z]/.test(value),
  },
  {
    message: "Password must contain a digit",
    test: (value) => /\d/.test(value),
  },
  {
    message: "Password must not contain spaces",
    test: (value) => !/\s/.test(value),
  },
];

/** Returns the first violated rule's message, or null when the password is ok. */
const validatePassword = (password) => {
  const failed = rules.find((rule) => !rule.test(password));
  return failed ? failed.message : null;
};

module.exports = {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  validatePassword,
};
