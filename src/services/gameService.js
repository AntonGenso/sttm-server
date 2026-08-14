const bcrypt = require("bcryptjs");
const pool = require("../config/db");
const rolesService = require("./rolesService");
const classesService = require("./classesService");
const authService = require("./authService");

const SALT_ROUNDS = 10;
const STUDENT_ROLE_NAME = "student";
const STUDENT_ROLE_LABEL = "Student";

/* ───────────────────────── Registration ───────────────────────── */

/**
 * Registers a game student: creates the account, marks it as `student`, joins
 * the class the invite code points at, and opens an empty game profile — all in
 * one transaction so a half-registered student is never left behind.
 *
 * `nickname` is expected already lower-cased by the caller (the game logs in
 * with the same lower-cased value, so the unique `users.name` stays consistent).
 */
const registerStudent = async (nickname, pin, inviteCode) => {
  // Read-only checks first, so we don't create a user only to roll it back.
  const targetClass = await classesService.findClassByInviteCode(inviteCode);
  if (!targetClass) {
    const error = new Error("Invite code not found");
    error.status = 404;
    throw error;
  }

  const existing = await authService.findUserByName(nickname);
  if (existing) {
    const error = new Error("This nickname is already taken");
    error.status = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(pin, SALT_ROUNDS);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      "INSERT INTO users (name, password) VALUES (?, ?)",
      [nickname, passwordHash],
    );
    const userId = result.insertId;

    const role = await rolesService.getOrCreateRoleByName(
      STUDENT_ROLE_NAME,
      STUDENT_ROLE_LABEL,
      connection,
    );
    await rolesService.assignRoleToUser(userId, role.id, connection);

    // Re-entering after removal reactivates the membership instead of failing
    // on the unique index — same rule as the teacher-side join.
    await connection.query(
      `INSERT INTO class_students (class_id, student_id, status)
       VALUES (?, ?, 'active')
       ON DUPLICATE KEY UPDATE status = 'active'`,
      [targetClass.id, userId],
    );

    await connection.query(
      "INSERT INTO game_profiles (user_id) VALUES (?)",
      [userId],
    );

    await connection.commit();

    return {
      id: userId,
      name: nickname,
      phone: null,
      roles: [role.name],
      class: {
        id: targetClass.id,
        grade: targetClass.grade,
        letter: targetClass.letter,
        school_name: targetClass.school_name,
      },
    };
  } catch (error) {
    await connection.rollback();

    // Two parallel registrations with the same nickname: the unique index wins.
    if (error.code === "ER_DUP_ENTRY") {
      const conflict = new Error("This nickname is already taken");
      conflict.status = 409;
      throw conflict;
    }
    throw error;
  } finally {
    connection.release();
  }
};

/* ───────────────────────── Profile read ───────────────────────── */

/** Ensures a profile row exists (older accounts, or defensive after failures). */
const ensureProfile = async (userId, executor = pool) => {
  await executor.query(
    "INSERT IGNORE INTO game_profiles (user_id) VALUES (?)",
    [userId],
  );
};

/**
 * Full game state for the profile screen: skin, leaderboard totals and the
 * per-item progress for every mission and test the student has touched.
 */
const getGameProfile = async (userId) => {
  await ensureProfile(userId);

  const [[profile]] = await pool.query(
    `SELECT user_id, head_id, suit_id, stars, score, total
       FROM game_profiles WHERE user_id = ?`,
    [userId],
  );

  const [missions] = await pool.query(
    `SELECT mission_id, status, best_score, attempts, started_at, completed_at
       FROM student_missions WHERE user_id = ? ORDER BY mission_id`,
    [userId],
  );

  const [tests] = await pool.query(
    `SELECT test_id, status, best_score, attempts, started_at, completed_at
       FROM student_tests WHERE user_id = ? ORDER BY test_id`,
    [userId],
  );

  return {
    skin: { headId: profile.head_id, suitId: profile.suit_id },
    leaderboard: {
      stars: profile.stars,
      score: profile.score,
      total: profile.total,
    },
    missions,
    tests,
  };
};

/** How many recent attempts the student card shows. */
const ATTEMPTS_LIMIT = 20;

/**
 * The teacher-facing report on one student.
 *
 * Unlike `getGameProfile`, this walks the catalog and not the progress rows:
 * every mission and test is listed, untouched ones included, because "never
 * started" is exactly what a teacher is looking for. Access is checked by the
 * caller — this service only knows the user id.
 */
const getStudentReport = async (userId) => {
  await ensureProfile(userId);

  const [[profile]] = await pool.query(
    `SELECT head_id, suit_id, stars, score, total
       FROM game_profiles WHERE user_id = ?`,
    [userId],
  );

  const [missions] = await pool.query(
    `SELECT m.id, m.name, m.label, m.xp, m.type,
            COALESCE(sm.status, 'open') AS status,
            COALESCE(sm.best_score, 0)  AS best_score,
            COALESCE(sm.attempts, 0)    AS attempts,
            sm.started_at, sm.completed_at
       FROM missions m
       LEFT JOIN student_missions sm
              ON sm.mission_id = m.id AND sm.user_id = ?
      ORDER BY m.id`,
    [userId],
  );

  const [tests] = await pool.query(
    `SELECT t.id, t.name, t.label, t.xp, t.question_count,
            COALESCE(st.status, 'open') AS status,
            COALESCE(st.best_score, 0)  AS best_score,
            COALESCE(st.attempts, 0)    AS attempts,
            st.started_at, st.completed_at
       FROM tests t
       LEFT JOIN student_tests st
              ON st.test_id = t.id AND st.user_id = ?
      ORDER BY t.id`,
    [userId],
  );

  // `kind` decides which catalog the item id points at, so both are joined and
  // only one of them ever matches.
  const [attempts] = await pool.query(
    `SELECT ga.id, ga.kind, ga.item_id, ga.score, ga.started_at, ga.finished_at,
            COALESCE(m.label, m.name, t.label, t.name) AS item_label
       FROM game_attempts ga
       LEFT JOIN missions m ON ga.kind = 'mission' AND m.id = ga.item_id
       LEFT JOIN tests    t ON ga.kind = 'test'    AND t.id = ga.item_id
      WHERE ga.user_id = ?
      ORDER BY ga.id DESC
      LIMIT ?`,
    [userId, ATTEMPTS_LIMIT],
  );

  return {
    skin: { headId: profile.head_id, suitId: profile.suit_id },
    leaderboard: {
      stars: profile.stars,
      score: profile.score,
      total: profile.total,
    },
    missions,
    tests,
    attempts,
  };
};

/* ───────────────────────── Totals ───────────────────────── */

/**
 * Recomputes and stores the denormalized leaderboard totals from the progress
 * rows. Runs on the same connection as the write that triggered it, so the
 * profile and the progress can never drift apart.
 *   stars = Σ best_score over missions,  score = Σ best_score over tests.
 */
const recomputeTotals = async (userId, executor) => {
  const [[starsRow]] = await executor.query(
    "SELECT COALESCE(SUM(best_score), 0) AS stars FROM student_missions WHERE user_id = ?",
    [userId],
  );
  const [[scoreRow]] = await executor.query(
    "SELECT COALESCE(SUM(best_score), 0) AS score FROM student_tests WHERE user_id = ?",
    [userId],
  );

  // SUM comes back as a DECIMAL string from mysql2; without Number() the "+"
  // below would concatenate ("80" + "0" -> "800") instead of adding.
  const stars = Number(starsRow.stars);
  const score = Number(scoreRow.score);
  const total = stars + score;

  await executor.query(
    `UPDATE game_profiles
        SET stars = ?, score = ?, total = ?
      WHERE user_id = ?`,
    [stars, score, total, userId],
  );

  return { stars, score, total };
};

/* ───────────────────────── Mission / test progress ───────────────────────── */

// Missions and tests share the exact same progress shape, so one pair of
// helpers drives both — `table` and the attempt `kind` are the only difference.
const PROGRESS = {
  mission: { table: "student_missions", column: "mission_id" },
  test: { table: "student_tests", column: "test_id" },
};

// A missing missions/tests row surfaces as a foreign key error; turn it into a
// clean 404 so the game doesn't see a generic 500.
const asNotFound = (error, kind) => {
  if (error.code === "ER_NO_REFERENCED_ROW_2" || error.code === "ER_NO_REFERENCED_ROW") {
    const notFound = new Error(`${kind === "mission" ? "Mission" : "Test"} not found`);
    notFound.status = 404;
    return notFound;
  }
  return error;
};

/**
 * Marks an item as started: bumps the replay counter and opens an attempt row.
 * A finished item stays `done` on replay; only its `attempts` grows.
 */
const startItem = async (kind, userId, itemId) => {
  const { table, column } = PROGRESS[kind];
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // `attempts` is owned by submit (counted on completion), so start only
    // marks the item as opened and never touches the counter.
    await connection.query(
      `INSERT INTO ${table} (user_id, ${column}, status, attempts, started_at)
       VALUES (?, ?, 'in_progress', 0, NOW())
       ON DUPLICATE KEY UPDATE
         started_at = COALESCE(started_at, NOW()),
         status     = IF(status = 'done', 'done', 'in_progress')`,
      [userId, itemId],
    );

    await connection.query(
      "INSERT INTO game_attempts (user_id, kind, item_id) VALUES (?, ?, ?)",
      [userId, kind, itemId],
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw asNotFound(error, kind);
  } finally {
    connection.release();
  }

  return { ok: true };
};

/**
 * Submits a result. Compare-and-keep-higher: `best_score` only grows, and the
 * leaderboard totals are recomputed in the same transaction. The most recent
 * open attempt for this item is finalized with the reported score.
 */
const submitItem = async (kind, userId, itemId, newScore) => {
  const { table, column } = PROGRESS[kind];
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Create the row if start was never called, then keep the higher score.
    // Each completed submission counts as one attempt (a replay / retake).
    await connection.query(
      `INSERT INTO ${table} (user_id, ${column}, status, best_score, attempts, completed_at)
       VALUES (?, ?, 'done', ?, 1, NOW())
       ON DUPLICATE KEY UPDATE
         best_score   = GREATEST(best_score, VALUES(best_score)),
         status       = 'done',
         attempts     = attempts + 1,
         completed_at = NOW()`,
      [userId, itemId, newScore],
    );

    // Close the latest open attempt (if any) with the reported score.
    await connection.query(
      `UPDATE game_attempts
          SET score = ?, finished_at = NOW()
        WHERE user_id = ? AND kind = ? AND item_id = ? AND finished_at IS NULL
        ORDER BY id DESC
        LIMIT 1`,
      [newScore, userId, kind, itemId],
    );

    const totals = await recomputeTotals(userId, connection);

    const [[row]] = await connection.query(
      `SELECT ${column} AS item_id, status, best_score, attempts, started_at, completed_at
         FROM ${table} WHERE user_id = ? AND ${column} = ?`,
      [userId, itemId],
    );

    await connection.commit();

    return { item: row, leaderboard: totals };
  } catch (error) {
    await connection.rollback();
    throw asNotFound(error, kind);
  } finally {
    connection.release();
  }
};

/* ───────────────────────── Skin ───────────────────────── */

const updateSkin = async (userId, headId, suitId) => {
  await ensureProfile(userId);
  await pool.query(
    "UPDATE game_profiles SET head_id = ?, suit_id = ? WHERE user_id = ?",
    [headId, suitId, userId],
  );
  return { skin: { headId, suitId } };
};

/* ───────────────────────── Leaderboard ───────────────────────── */

/**
 * Top students by total, newest-highest first. When `classId` is given, scopes
 * to that class through `class_students`; otherwise it is global.
 */
const getLeaderboard = async ({ classId = null, limit = 100 } = {}) => {
  const params = [];
  let scope = "";
  if (classId) {
    scope = `JOIN class_students cs
               ON cs.student_id = u.id
              AND cs.class_id = ?
              AND cs.status <> 'removed'`;
    params.push(classId);
  }
  params.push(limit);

  const [rows] = await pool.query(
    `SELECT u.id, u.name AS nickname,
            gp.head_id, gp.suit_id,
            gp.stars, gp.score, gp.total
       FROM game_profiles gp
       JOIN users u ON u.id = gp.user_id
       ${scope}
      ORDER BY gp.total DESC, u.name ASC
      LIMIT ?`,
    params,
  );

  return rows.map((r) => ({
    nickname: r.nickname,
    skin: { headId: r.head_id, suitId: r.suit_id },
    stars: r.stars,
    score: r.score,
    total: r.total,
  }));
};

module.exports = {
  registerStudent,
  getGameProfile,
  getStudentReport,
  startItem,
  submitItem,
  updateSkin,
  getLeaderboard,
};
