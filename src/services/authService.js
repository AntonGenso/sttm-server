const bcrypt = require("bcryptjs");
const pool = require("../config/db");
const rolesService = require("./rolesService");
const profileService = require("./profileService");

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
 * The single shape of "the signed-in user" — returned by register, login and
 * refresh alike. The city and the school are part of it because the panel gates
 * class creation on them: it has to know whether the profile is complete
 * without a second request after every token rotation.
 */
const toAuthUser = (profile, roles) => ({
  id: profile.id,
  name: profile.name,
  phone: profile.phone ?? null,
  roles,
  cityId: profile.city_id ?? null,
  cityName: profile.city_name ?? null,
  schoolId: profile.school_id ?? null,
  schoolName: profile.school_name ?? null,
});

const getAuthUser = async (userId) => {
  const profile = await profileService.getProfile(userId);
  if (!profile) {
    const error = new Error("User not found");
    error.status = 401;
    throw error;
  }
  const roles = await rolesService.getUserRoleNames(userId);
  return toAuthUser(profile, roles);
};

/**
 * Loads the auth view of a user by id, roles included. Used by /auth/refresh so
 * every rotated access token carries the roles as they are in the DB *now* —
 * this is what lets a freshly granted teacher role take effect without a manual
 * re-login, and what keeps a just-filled-in profile from needing one either.
 */
const getAuthUserById = (id) => getAuthUser(id);

/**
 * Creates the account and, if the form carried them, its city and school.
 *
 * Both are optional on purpose: a teacher whose school is not in the directory
 * yet still gets an account. `classesService` is what refuses to create a class
 * until they are filled in.
 */
const registerUser = async (name, phone, password, profile = {}) => {
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
    const userId = result.insertId;

    const role = await rolesService.getOrCreateRoleByName(
      DEFAULT_ROLE_NAME,
      DEFAULT_ROLE_LABEL,
      connection,
    );
    await rolesService.assignRoleToUser(userId, role.id, connection);

    // A school the teacher typed here is created the same way as anywhere else:
    // unverified, and waiting for the admin to confirm or merge it.
    const resolved = await profileService.resolveCityAndSchool(profile, {
      userId,
      executor: connection,
    });
    await profileService.writeCityAndSchool(userId, resolved, connection);

    const created = await profileService.getProfile(userId, connection);
    await connection.commit();

    return toAuthUser(created, [role.name]);
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

  return getAuthUser(user.id);
};

module.exports = {
  findUserByName,
  findUserById,
  getAuthUser,
  getAuthUserById,
  registerUser,
  loginUser,
  DEFAULT_ROLE_NAME,
};
