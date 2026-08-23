const pool = require("../config/db");

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

/**
 * Teachers type the city by hand — the seeded list never covers every town — so
 * the same city would otherwise be created once per spelling. Lookup goes
 * through `name_ru` (its collation is case-insensitive), and the unique index
 * settles the race between two teachers registering it at once.
 *
 * `executor` is either the pool or a connection, so this can run in the same
 * transaction as the class insert.
 */
const getOrCreateCity = async (name, executor = pool) => {
  const trimmedName = name.trim();

  const [existing] = await executor.query(
    "SELECT id, name_ru FROM cities WHERE name_ru = ?",
    [trimmedName],
  );
  if (existing.length) {
    return existing[0];
  }

  try {
    const [result] = await executor.query(
      "INSERT INTO cities (name_ru) VALUES (?)",
      [trimmedName],
    );
    return { id: result.insertId, name_ru: trimmedName };
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      const [rows] = await executor.query(
        "SELECT id, name_ru FROM cities WHERE name_ru = ?",
        [trimmedName],
      );
      if (rows.length) {
        return rows[0];
      }
    }
    throw error;
  }
};

module.exports = {
  getCities,
  getOrCreateCity,
};
