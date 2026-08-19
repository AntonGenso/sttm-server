const crypto = require("crypto");
const pool = require("../config/db");

// How long a refresh token stays valid. The access token is minutes; this is
// the real session length — how long a user can stay away and still come back
// without re-entering the password.
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TTL_DAYS || 30);
const REFRESH_TTL_MS = REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;

/** Opaque token the client stores; only its hash is ever written to the DB. */
const generateToken = () => crypto.randomBytes(32).toString("hex");

/** SHA-256 is enough here: the token is 256 bits of entropy, not a password. */
const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const expiryDate = () => new Date(Date.now() + REFRESH_TTL_MS);

/**
 * Issues a fresh refresh token for a user and stores its hash. `executor` lets
 * the caller pass a transaction connection so registration can hand out the
 * token in the same commit as the account.
 */
const issueRefreshToken = async (userId, executor = pool) => {
  const token = generateToken();
  await executor.query(
    "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
    [userId, hashToken(token), expiryDate()],
  );
  return token;
};

const invalidToken = () => {
  const error = new Error("Invalid or expired refresh token");
  error.status = 401;
  return error;
};

/**
 * Validates a refresh token and rotates it: the presented token is revoked and
 * a new one is issued in the same transaction. Returns `{ userId, refreshToken }`.
 *
 * Reuse detection: presenting a token that was already revoked means either a
 * stolen token or a stale client. We can't tell which, so we revoke every live
 * token of that user — the safe move — and reject. The legitimate user simply
 * logs in again.
 */
const rotateRefreshToken = async (token) => {
  const tokenHash = hashToken(token);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      "SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ? FOR UPDATE",
      [tokenHash],
    );
    const record = rows[0];

    if (!record) {
      await connection.commit();
      throw invalidToken();
    }

    if (record.revoked_at) {
      // Token was already rotated away — treat as compromise, kill the family.
      await connection.query(
        "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL",
        [record.user_id],
      );
      await connection.commit();
      throw invalidToken();
    }

    if (new Date(record.expires_at) <= new Date()) {
      await connection.query(
        "UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?",
        [record.id],
      );
      await connection.commit();
      throw invalidToken();
    }

    await connection.query(
      "UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?",
      [record.id],
    );
    const newToken = generateToken();
    await connection.query(
      "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
      [record.user_id, hashToken(newToken), expiryDate()],
    );

    await connection.commit();
    return { userId: record.user_id, refreshToken: newToken };
  } catch (error) {
    // Only roll back if we never committed; a committed-then-thrown branch
    // (reuse/expiry above) has already persisted the revocation it needed.
    if (!error.status) {
      await connection.rollback();
    }
    throw error;
  } finally {
    connection.release();
  }
};

/** Best-effort revoke on logout. A missing/already-revoked token is a no-op. */
const revokeRefreshToken = async (token) => {
  await pool.query(
    "UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL",
    [hashToken(token)],
  );
};

module.exports = {
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  REFRESH_TTL_DAYS,
};
