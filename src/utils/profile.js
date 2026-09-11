const { containsProfanity } = require("./profanity");

const SCHOOL_NAME_MAX_LENGTH = 255;

/**
 * Разбирает город и школу из тела запроса — общий вход для регистрации и для
 * правки профиля, чтобы правила не разъезжались между ними.
 *
 * Возвращает `{ value }` только с теми ключами, которые реально пришли:
 * отсутствующий ключ означает «не трогать», явный `null` — «очистить».
 * `schoolName` учитывается лишь когда `schoolId` не прислан: школу из списка
 * выбирают по id, а имя приходит только когда учитель заводит новую.
 */
const parseProfileInput = (body = {}) => {
  const value = {};

  if (body.cityId !== undefined) {
    if (body.cityId === null || body.cityId === "") {
      value.cityId = null;
    } else {
      const cityId = Number(body.cityId);
      if (!Number.isInteger(cityId) || cityId <= 0) {
        return { error: "Invalid city" };
      }
      value.cityId = cityId;
    }
  }

  if (body.schoolId !== undefined) {
    if (body.schoolId === null || body.schoolId === "") {
      value.schoolId = null;
    } else {
      const schoolId = Number(body.schoolId);
      if (!Number.isInteger(schoolId) || schoolId <= 0) {
        return { error: "Invalid school" };
      }
      value.schoolId = schoolId;
    }
  }

  if (value.schoolId === undefined || value.schoolId === null) {
    const schoolName =
      typeof body.schoolName === "string" ? body.schoolName.trim() : "";
    if (schoolName) {
      if (schoolName.length > SCHOOL_NAME_MAX_LENGTH) {
        return {
          error: `School name must be at most ${SCHOOL_NAME_MAX_LENGTH} characters long`,
        };
      }
      if (containsProfanity(schoolName)) {
        return { error: "School name contains inappropriate language" };
      }
      value.schoolName = schoolName;
      // Явный null плюс новое имя — это «заменить школу», а не «очистить».
      delete value.schoolId;
    }
  }

  return { value };
};

module.exports = {
  SCHOOL_NAME_MAX_LENGTH,
  parseProfileInput,
};
