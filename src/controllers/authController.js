const jwt = require("jsonwebtoken");
const services = require("../services/authService");
const { validatePassword } = require("../utils/password");
const { normalizePhone, PHONE_ERROR } = require("../utils/phone");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

const signToken = (user) =>
  jwt.sign(
    { sub: user.id, name: user.name, roles: user.roles ?? [] },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );

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
    const token = signToken(user);

    res.status(201).json({ user, token });
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
    const token = signToken(user);

    res.status(200).json({ user, token });
  } catch (error) {
    console.error(error);
    if (error.status === 401) {
      return res.status(401).json({ message: error.message });
    }
    res.status(500).json({ message: "Error logging in" });
  }
};

module.exports = {
  register,
  login,
};
