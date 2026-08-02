const bcrypt = require("bcryptjs");
const pool = require("../config/db");

const SALT_ROUNDS = 10;

const findUserByName = async (name) => {
  const [rows] = await pool.query("SELECT * FROM users WHERE name = ?", [name]);
  return rows[0] ?? null;
};

const registerUser = async (name, password) => {
  const existing = await findUserByName(name);
  if (existing) {
    const error = new Error("User with this name already exists");
    error.status = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const [result] = await pool.query(
    "INSERT INTO users (name, password) VALUES (?, ?)",
    [name, passwordHash],
  );

  return { id: result.insertId, name };
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

  return { id: user.id, name: user.name };
};

module.exports = {
  findUserByName,
  registerUser,
  loginUser,
};
