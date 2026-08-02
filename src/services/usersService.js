const pool = require("../config/db");

const getUsers = async () => {
  try {
    const [rows] = await pool.query("SELECT * FROM users");
    return rows;
  } catch (error) {
    console.error(error);
    throw new Error("Error fetching users");
  }
};

const getUserById = async (id) => {
  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
    if (rows.length === 0) {
      throw new Error("User not found");
    }
    return rows[0] ?? null;
  } catch (error) {
    console.error(error);
    throw new Error("Error fetching user by ID");
  }
};

module.exports = {
  getUsers,
  getUserById,
};
