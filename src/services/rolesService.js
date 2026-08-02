const pool = require("../config/db");

const getRoles = async () => {
  try {
    const [rows] = await pool.query("SELECT * FROM roles");
    return rows;
  } catch (error) {
    console.error(error);
    throw new Error("Errog getting roles");
  }
};

const getRoleByName = async (roleName) => {
  try {
    const [rows] = await pool.query("SELECT * FROM roles WHERE name=?", [
      roleName,
    ]);
    return rows[0] ?? null;
  } catch (error) {
    console.error(error);
    throw new Error("Error fetching role by name");
  }
};

module.exports = {
  getRoles,
  getRoleByName,
};
