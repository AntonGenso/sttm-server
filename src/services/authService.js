const bcrypt = require("bcryptjs");
const pool = require("../config/db");
const rolesService = require("./rolesService");

const SALT_ROUNDS = 10;

// Every account created through sttm-admin starts as a teacher; admin/student
// roles are granted afterwards through the roles management.
const DEFAULT_ROLE_NAME = "teacher";
const DEFAULT_ROLE_LABEL = "Teacher";

const findUserByName = async (name) => {
  const [rows] = await pool.query("SELECT * FROM users WHERE name = ?", [name]);
  return rows[0] ?? null;
};

const findUserById = async (id) => {
  const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
  return rows[0] ?? null;
};

/**
 * Loads the auth view of a user by id, roles included. Used by /auth/refresh so
 * every rotated access token carries the roles as they are in the DB *now* —
 * this is what lets a freshly granted teacher role take effect without a manual
 * re-login.
 */
const getAuthUserById = async (id) => {
  const user = await findUserById(id);
  if (!user) {
    const error = new Error("User not found");
    error.status = 401;
    throw error;
  }

  const roles = await rolesService.getUserRoleNames(user.id);
  return { id: user.id, name: user.name, phone: user.phone ?? null, roles };
};

const registerUser = async (name, phone, password) => {
  const existing = await findUserByName(name);
  if (existing) {
    const error = new Error("User with this name already exists");
    error.status = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      "INSERT INTO users (name, phone, password) VALUES (?, ?, ?)",
      [name, phone, passwordHash],
    );

    const role = await rolesService.getOrCreateRoleByName(
      DEFAULT_ROLE_NAME,
      DEFAULT_ROLE_LABEL,
      connection,
    );
    await rolesService.assignRoleToUser(result.insertId, role.id, connection);

    await connection.commit();

    return { id: result.insertId, name, phone, roles: [role.name] };
  } catch (error) {
    await connection.rollback();

    // Two parallel registrations with the same name: the unique index wins.
    if (error.code === "ER_DUP_ENTRY") {
      const conflict = new Error("User with this name already exists");
      conflict.status = 409;
      throw conflict;
    }

    throw error;
  } finally {
    connection.release();
  }
};

const loginUser = async (name, password) => {
  const user = await findUserByName(name);
  if (!user) {
    const error = new Error("Invalid name or password");
    error.status = 401;
    throw error;
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    const error = new Error("Invalid name or password");
    error.status = 401;
    throw error;
  }

  const roles = await rolesService.getUserRoleNames(user.id);

  return { id: user.id, name: user.name, phone: user.phone ?? null, roles };
};

module.exports = {
  findUserByName,
  findUserById,
  getAuthUserById,
  registerUser,
  loginUser,
  DEFAULT_ROLE_NAME,
};
