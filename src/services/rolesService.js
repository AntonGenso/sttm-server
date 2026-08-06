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

// `executor` is either the pool or a connection taken from it, so the same
// helpers can be reused inside a transaction.
const getRoleByName = async (roleName, executor = pool) => {
  try {
    const [rows] = await executor.query("SELECT * FROM roles WHERE name=?", [
      roleName,
    ]);
    return rows[0] ?? null;
  } catch (error) {
    console.error(error);
    throw new Error("Error fetching role by name");
  }
};

const getOrCreateRoleByName = async (roleName, label, executor = pool) => {
  const existing = await getRoleByName(roleName, executor);
  if (existing) {
    return existing;
  }

  try {
    const [result] = await executor.query(
      "INSERT INTO roles (name, label) VALUES (?, ?)",
      [roleName, label ?? roleName],
    );
    return { id: result.insertId, name: roleName, label: label ?? roleName };
  } catch (error) {
    console.error(error);
    throw new Error("Error creating role");
  }
};

const assignRoleToUser = async (userId, roleId, executor = pool) => {
  try {
    await executor.query(
      "INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)",
      [userId, roleId],
    );
  } catch (error) {
    console.error(error);
    throw new Error("Error assigning role to user");
  }
};

const getUserRoleNames = async (userId, executor = pool) => {
  try {
    const [rows] = await executor.query(
      `SELECT r.name
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = ?`,
      [userId],
    );
    return rows.map((row) => row.name);
  } catch (error) {
    console.error(error);
    throw new Error("Error fetching user roles");
  }
};

module.exports = {
  getRoles,
  getRoleByName,
  getOrCreateRoleByName,
  assignRoleToUser,
  getUserRoleNames,
};
