const pool = require("../config/db");
const { normalizeSchoolName, findSimilar } = require("../utils/dictionaries");

const httpError = (status, message, details) => {
  const error = new Error(message);
  error.status = status;
  if (details) {
    error.details = details;
  }
  return error;
};

const SCHOOL_SELECT = `SELECT id, city_id, name, is_verified FROM schools`;

const getSchoolsByCity = async (cityId) => {
  try {
    const [rows] = await pool.query(
      `${SCHOOL_SELECT} WHERE city_id = ? ORDER BY name`,
      [cityId],
    );
    return rows;
  } catch (error) {
    console.error(error);
    throw new Error("Error fetching schools");
  }
};

const getSchoolById = async (schoolId, executor = pool) => {
  const [rows] = await executor.query(`${SCHOOL_SELECT} WHERE id = ?`, [
    schoolId,
  ]);
  return rows[0] ?? null;
};

/**
 * Школы города, похожие на то, что вводит учитель.
 *
 * Ключ уникальности намеренно строгий, поэтому «Школа №5» и «Школа №5 им.
 * Навои» остаются разными строками. Эта подсказка — вторая линия защиты от
 * дублей: перед тем как завести школу, учитель видит, что в его городе уже
 * есть похожая, и обычно выбирает её.
 */
const findSimilarSchools = async (cityId, name) => {
  const schools = await getSchoolsByCity(cityId);
  const normalized = normalizeSchoolName(name);
  return findSimilar(
    name,
    // Точное совпадение по ключу подсказывать незачем: такую школу вернёт сам
    // get-or-create, новой строки не появится.
    schools.filter((school) => normalizeSchoolName(school.name) !== normalized),
  );
};

/**
 * Находит школу города или заводит новую.
 *
 * Заведённая учителем школа помечается `is_verified = 0` и попадает к админу в
 * очередь на проверку — переименовать, объединить с дублем или подтвердить.
 * Само создание при этом никого не блокирует: справочник школ пустой, а школ в
 * стране тысячи, и «дождитесь, пока админ заведёт вашу школу» на входе означало
 * бы, что первым же экраном учитель упирается в стену.
 *
 * Поиск идёт через `name_normalized`, а гонку двух учителей, регистрирующих
 * одну школу одновременно, разрешает уникальный индекс.
 *
 * `executor` — пул или соединение, чтобы вызов ложился в общую транзакцию.
 */
const getOrCreateSchool = async (cityId, name, createdBy, executor = pool) => {
  const trimmedName = name.trim();
  const normalized = normalizeSchoolName(trimmedName);

  const [existing] = await executor.query(
    `${SCHOOL_SELECT} WHERE city_id = ? AND name_normalized = ?`,
    [cityId, normalized],
  );
  if (existing.length) {
    return existing[0];
  }

  try {
    const [result] = await executor.query(
      `INSERT INTO schools (city_id, name, name_normalized, created_by, is_verified)
       VALUES (?, ?, ?, ?, 0)`,
      [cityId, trimmedName, normalized, createdBy ?? null],
    );
    return {
      id: result.insertId,
      city_id: cityId,
      name: trimmedName,
      is_verified: 0,
    };
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      const [rows] = await executor.query(
        `${SCHOOL_SELECT} WHERE city_id = ? AND name_normalized = ?`,
        [cityId, normalized],
      );
      if (rows.length) {
        return rows[0];
      }
    }
    // Несуществующий city_id всплывает здесь ошибкой внешнего ключа.
    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      throw httpError(400, "City not found");
    }
    throw error;
  }
};

module.exports = {
  getSchoolsByCity,
  getSchoolById,
  findSimilarSchools,
  getOrCreateSchool,
};
