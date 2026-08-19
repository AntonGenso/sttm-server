const jwt = require("jsonwebtoken");
const services = require("../services/authService");
const gameService = require("../services/gameService");
const refreshTokenService = require("../services/refreshTokenService");
const { validatePassword } = require("../utils/password");
const { normalizePhone, PHONE_ERROR } = require("../utils/phone");
const { normalizeInviteCode, isValidInviteCode } = require("../utils/classes");

// Game nicknames: 2–16 latin letters, digits or underscore. Mirrors the client
// validator in step-to-the-moon.
const NICKNAME_REGEX = /^[a-zA-Z0-9_]{2,16}$/;
// Game PIN: exactly four digits. Students never type a full password, so the
// account password is the PIN (hashed like any other).
const PIN_REGEX = /^\d{4}$/;

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
// Short-lived on purpose: the access token is a cache of the user's roles, and
// /auth/refresh re-reads roles from the DB every time it mints a new one. Keep
// this small so a role change (e.g. granting a teacher) takes effect quickly.
const JWT_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || "15m";

const signToken = (user) =>
  jwt.sign(
    { sub: user.id, name: user.name, roles: user.roles ?? [] },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );

/**
 * Builds the standard auth response: a short access token plus a freshly issued
 * refresh token. Used by register/login/student-register so every entry point
 * returns the same shape.
 */
const issueSession = async (user) => {
  const token = signToken(user);
  const refreshToken = await refreshTokenService.issueRefreshToken(user.id);
  return { user, token, refreshToken };
};

const register = async (req, res) => {
  try {
    const { name, phone, password } = req.body;

    if (!name || !phone || !password) {
      return res
        .status(400)
        .json({ message: "Name, phone and password are required" });
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ message: PHONE_ERROR });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const user = await services.registerUser(
      name.trim(),
      normalizedPhone,
      password,
    );

    res.status(201).json(await issueSession(user));
  } catch (error) {
    console.error(error);
    if (error.status === 409) {
      return res.status(409).json({ message: error.message });
    }
    res.status(500).json({ message: "Error registering user" });
  }
};

const login = async (req, res) => {
  try {
    const { name, password } = req.body;

    if (!name || !password) {
      return res
        .status(400)
        .json({ message: "Name and password are required" });
    }

    const user = await services.loginUser(name.trim(), password);

    res.status(200).json(await issueSession(user));
  } catch (error) {
    console.error(error);
    if (error.status === 401) {
      return res.status(401).json({ message: error.message });
    }
    res.status(500).json({ message: "Error logging in" });
  }
};

/**
 * Student self-registration from the game. Creates the account (PIN as the
 * hashed password), marks it `student`, and joins the class the invite code
 * points at. The nickname is lower-cased so login stays case-insensitive.
 */
const registerStudent = async (req, res) => {
  try {
    const { nickname, pin, classCode } = req.body;

    if (typeof nickname !== "string" || !NICKNAME_REGEX.test(nickname.trim())) {
      return res.status(400).json({ message: "Invalid nickname" });
    }
    if (typeof pin !== "string" || !PIN_REGEX.test(pin)) {
      return res.status(400).json({ message: "PIN must be exactly 4 digits" });
    }

    const code = normalizeInviteCode(classCode);
    if (!isValidInviteCode(code)) {
      return res.status(400).json({ message: "Invalid class code" });
    }

    const user = await gameService.registerStudent(
      nickname.trim().toLowerCase(),
      pin,
      code,
    );

    res.status(201).json(await issueSession(user));
  } catch (error) {
    console.error(error);
    if (error.status === 404) {
      return res.status(404).json({ message: error.message });
    }
    if (error.status === 409) {
      return res.status(409).json({ message: error.message });
    }
    res.status(500).json({ message: "Error registering student" });
  }
};

/**
 * Exchanges a valid refresh token for a new access token, rotating the refresh
 * token in the process. Roles are re-read from the DB here, so this is also the
 * moment a role change propagates into the session.
 */
const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (typeof refreshToken !== "string" || !refreshToken) {
      return res.status(400).json({ message: "Refresh token is required" });
    }

    const { userId, refreshToken: rotated } =
      await refreshTokenService.rotateRefreshToken(refreshToken);
    const user = await services.getAuthUserById(userId);
    const token = signToken(user);

    res.status(200).json({ user, token, refreshToken: rotated });
  } catch (error) {
    if (error.status === 401) {
      return res.status(401).json({ message: error.message });
    }
    console.error(error);
    res.status(500).json({ message: "Error refreshing session" });
  }
};

/** Revokes the refresh token so it can no longer be rotated. */
const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (typeof refreshToken === "string" && refreshToken) {
      await refreshTokenService.revokeRefreshToken(refreshToken);
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error logging out" });
  }
};

module.exports = {
  register,
  login,
  registerStudent,
  refresh,
  logout,
};
