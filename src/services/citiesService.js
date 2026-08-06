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

module.exports = {
  getCities,
};
