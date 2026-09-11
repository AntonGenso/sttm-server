const pool = require("../config/db");
const schoolsService = require("./schoolsService");

/**
 * Город и школа учителя.
 *
 * Раньше и то, и другое вводилось заново при каждом создании класса. Теперь это
 * свойство аккаунта: город учитель меняет примерно никогда, школу — редко, а
 * создание класса сводится к «класс + буква».
 *
 * Оба поля могут быть пустыми: регистрация не должна упираться в справочник.
 * Но класс без них не создать — `classesService.createClass` отвечает 400 с
 * кодом `PROFILE_INCOMPLETE`, и приложение ведёт учителя дозаполнить профиль.
 */

const httpError = (status, message, code) => {
  const error = new Error(message);
  error.status = status;
  if (code) {
    error.code = code;
  }
  return error;
};

const PROFILE_SELECT = `
  SELECT u.id,
         u.name,
         u.phone,
         u.city_id,
         ci.name_ru AS city_name,
         u.school_id,
         s.name        AS school_name,
         s.is_verified AS school_is_verified
    FROM users u
    LEFT JOIN cities  ci ON ci.id = u.city_id
    LEFT JOIN schools s  ON s.id = u.school_id
`;

const getProfile = async (userId, executor = pool) => {
  const [rows] = await executor.query(`${PROFILE_SELECT} WHERE u.id = ?`, [
    userId,
  ]);
  return rows[0] ?? null;
};

const readCity = async (cityId, executor) => {
  const [rows] = await executor.query(
    "SELECT id, is_active FROM cities WHERE id = ?",
    [cityId],
  );
  return rows[0] ?? null;
};

/**
 * Приводит присланные `{ cityId, schoolId, schoolName }` к паре id, пригодной
 * для записи в `users`.
 *
 * Общая для регистрации и для правки профиля, поэтому берёт текущее состояние
 * отдельным аргументом: при регистрации его просто нет.
 *
 * Два правила, которые здесь важнее остальных:
 *   • школа обязана принадлежать выбранному городу — иначе она не школа этого
 *     учителя, а чужая строка справочника;
 *   • смена города без новой школы обнуляет школу, а не оставляет прежнюю в
 *     другом городе.
 */
const resolveCityAndSchool = async (
  { cityId, schoolId, schoolName },
  { current = null, userId = null, executor = pool } = {},
) => {
  const hasCity = cityId !== undefined;
  const hasSchoolId = schoolId !== undefined;
  const hasSchoolName = typeof schoolName === "string" && schoolName.trim();

  let nextCityId = hasCity ? cityId : (current?.city_id ?? null);
  let nextSchoolId = hasSchoolId ? schoolId : (current?.school_id ?? null);

  if (nextCityId !== null && nextCityId !== undefined) {
    const city = await readCity(nextCityId, executor);
    if (!city) {
      throw httpError(400, "City not found");
    }
    if (!city.is_active) {
      throw httpError(400, "This city is not available");
    }
  } else {
    nextCityId = null;
    // Без города школа бессмысленна: она уникальна именно внутри города.
    nextSchoolId = null;
  }

  if (nextCityId && !hasSchoolId && hasSchoolName) {
    const school = await schoolsService.getOrCreateSchool(
      nextCityId,
      schoolName,
      userId,
      executor,
    );
    nextSchoolId = school.id;
  }

  if (nextCityId && nextSchoolId) {
    const school = await schoolsService.getSchoolById(nextSchoolId, executor);
    if (!school) {
      throw httpError(400, "School not found");
    }
    if (school.city_id !== nextCityId) {
      // Смена города — школа прежнего города отваливается вместе с ним;
      // явно присланная чужая школа отвергается.
      if (hasSchoolId || hasSchoolName) {
        throw httpError(400, "This school belongs to another city");
      }
      nextSchoolId = null;
    }
  }

  return { cityId: nextCityId, schoolId: nextSchoolId ?? null };
};

/** Пишет разрешённую пару в `users` — тем же путём для регистрации и правки. */
const writeCityAndSchool = async (userId, { cityId, schoolId }, executor = pool) => {
  await executor.query(
    "UPDATE users SET city_id = ?, school_id = ? WHERE id = ?",
    [cityId ?? null, schoolId ?? null, userId],
  );
};

const updateProfile = async (userId, patch) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const current = await getProfile(userId, connection);
    if (!current) {
      throw httpError(404, "User not found");
    }

    const resolved = await resolveCityAndSchool(patch, {
      current,
      userId,
      executor: connection,
    });
    await writeCityAndSchool(userId, resolved, connection);

    const updated = await getProfile(userId, connection);
    await connection.commit();
    return updated;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  getProfile,
  resolveCityAndSchool,
  writeCityAndSchool,
  updateProfile,
};
