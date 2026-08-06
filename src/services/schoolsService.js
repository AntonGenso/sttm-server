const pool = require("../config/db");
const { normalizeSchoolName } = require("../utils/classes");

const getSchoolsByCity = async (cityId) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, city_id, name
         FROM schools
        WHERE city_id = ?
        ORDER BY name`,
      [cityId],
    );
    return rows;
  } catch (error) {
    console.error(error);
    throw new Error("Error fetching schools");
  }
};

/**
 * Teachers type the school by hand, so the same building would otherwise be
 * created once per spelling. Lookup goes through `name_normalized`, and the
 * unique index settles the race between two teachers registering it at once.
 *
 * `executor` is either the pool or a connection, so this can run in a
 * transaction together with the class insert.
 */
const getOrCreateSchool = async (cityId, name, createdBy, executor = pool) => {
  const trimmedName = name.trim();
  const normalized = normalizeSchoolName(trimmedName);

  const [existing] = await executor.query(
    "SELECT id, city_id, name FROM schools WHERE city_id = ? AND name_normalized = ?",
    [cityId, normalized],
  );
  if (existing.length) {
    return existing[0];
  }

  try {
    const [result] = await executor.query(
      `INSERT INTO schools (city_id, name, name_normalized, created_by)
       VALUES (?, ?, ?, ?)`,
      [cityId, trimmedName, normalized, createdBy ?? null],
    );
    return { id: result.insertId, city_id: cityId, name: trimmedName };
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      const [rows] = await executor.query(
        "SELECT id, city_id, name FROM schools WHERE city_id = ? AND name_normalized = ?",
        [cityId, normalized],
      );
      if (rows.length) {
        return rows[0];
      }
    }
    // A bad city_id surfaces here as a foreign key error.
    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      const conflict = new Error("City not found");
      conflict.status = 400;
      throw conflict;
    }
    throw error;
  }
};

module.exports = {
  getSchoolsByCity,
  getOrCreateSchool,
};
