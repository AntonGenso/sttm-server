const jwt = require("jsonwebtoken");
const services = require("../services/authService");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

const signToken = (user) =>
  jwt.sign({ sub: user.id, name: user.name }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

const register = async (req, res) => {
  try {
    const { name, password } = req.body;

    if (!name || !password) {
      return res
        .status(400)
        .json({ message: "Name and password are required" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters long" });
    }

    const user = await services.registerUser(name.trim(), password);
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
