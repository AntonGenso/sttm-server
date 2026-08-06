const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

/**
 * Reads the bearer token and puts `{ id, name, roles }` on `req.user`.
 * Anything a route derives from the caller (their classes, for instance) has to
 * come from here — never from the request body.
 */
const authenticate = (req, res, next) => {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Authorization token is required" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.sub,
      name: payload.name,
      roles: payload.roles ?? [],
    };
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

/** Use after `authenticate`: 403s callers that hold none of the given roles. */
const requireRole =
  (...roles) =>
  (req, res, next) => {
    const granted = req.user?.roles ?? [];
    if (!roles.some((role) => granted.includes(role))) {
      return res.status(403).json({ message: "Not enough permissions" });
    }
    next();
  };

module.exports = {
  authenticate,
  requireRole,
};
