// Mirrors sttm-admin/src/utils/phone.ts — the client formats for UX, this is
// what decides what actually lands in the database.

/** Country code + 2-digit operator code + 7 digits, e.g. +998(90)1234567. */
const NATIONAL_LENGTH = 9;
const COUNTRY_CODE = "998";

const PHONE_ERROR = "Enter a valid phone number in the +998(99)9999999 format";

/**
 * Digits of the national part.
 *
 * A leading `+998` is dropped first. A national number may legitimately start
 * with 998 itself (99 8xxxxxx), so the country code is only stripped again once
 * the national part overflows — that is when the number carried it twice.
 */
const toNationalDigits = (value) => {
  const trimmed = value.trim();
  const withoutPrefix = trimmed.startsWith(`+${COUNTRY_CODE}`)
    ? trimmed.slice(COUNTRY_CODE.length + 1)
    : trimmed;

  const digits = withoutPrefix.replace(/\D/g, "");

  return digits.length > NATIONAL_LENGTH && digits.startsWith(COUNTRY_CODE)
    ? digits.slice(COUNTRY_CODE.length)
    : digits;
};

/**
 * Brings user input to E.164 (`+998901234567`) so the same number sent as
 * `+998(90)1234567`, `901234567` or `+998 90 123 45 67` is stored one way.
 * Returns null when the value is not a complete uzbek number — foreign numbers
 * are rejected rather than truncated to nine digits.
 */
const normalizePhone = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const digits = toNationalDigits(value);
  return digits.length === NATIONAL_LENGTH ? `+${COUNTRY_CODE}${digits}` : null;
};

module.exports = {
  PHONE_ERROR,
  normalizePhone,
};
