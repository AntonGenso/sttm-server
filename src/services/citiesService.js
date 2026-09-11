const pool = require("../config/db");

/**
 * Справочник городов.
 *
 * Города заводит только админ: список закрытый (столица, столица республики,
 * областные центры и крупные города), и свободный ввод здесь порождал дубли,
 * которые тянули за собой дубли школ — школа уникальна внутри города, поэтому
 * второй «г. Ташкент» расщеплял и школы, и статистику.
 */

/** То, что видит учитель при выборе города: только активные. */
const getCities = async () => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name_ru, name_uz, region
         FROM cities
        WHERE is_active = 1
        ORDER BY name_ru`,
    );
    return rows;
  } catch (error) {
    console.error(error);
    throw new Error("Error fetching cities");
  }
};

module.exports = {
  getCities,
};
