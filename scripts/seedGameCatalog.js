/**
 * Fills `missions` and `tests` with the step-to-the-moon game catalog, so the
 * student progress tables (student_missions / student_tests) have valid rows to
 * reference through their foreign keys.
 *
 * Run with `npm run seed:game`. Safe to re-run: rows are matched by their
 * explicit id, existing ones only get their fields refreshed.
 *
 * ── ID mapping ──────────────────────────────────────────────────────────────
 * The game's `missionData` numbers missions from 0; a 0 primary key is awkward
 * in MySQL (AUTO_INCREMENT starts at 1), so every mission is stored at
 * `gameId + 1`. The step-to-the-moon front-end is renumbered to match (1..21),
 * so the id the game submits always equals `missions.id` — no offset at runtime.
 *
 * NOTE: ids 1 and 2 currently hold placeholder admin missions
 * ("star-wars" / "interstellar"); this seed repurposes them into the first two
 * game missions.
 */
const pool = require("../src/config/db");

// [title, type] in game order (gameId 0..20). Stored id = index + 1. xp = 100.
const GAME_MISSIONS = [
  ["Earth", "current"],
  ["Earth", "bonus"],
  ["Atmosphere", "current"],
  ["Atmosphere", "bonus"],
  ["Canyon Flight", "current"],
  ["Telescope", "current"],
  ["Telescope", "bonus"],
  ["Satellite", "current"],
  ["Satellite", "bonus"],
  ["Rocket", "current"],
  ["Rocket", "bonus"],
  ["Solar System", "current"],
  ["Solar System", "bonus"],
  ["Moon Rover", "current"],
  ["Moon Rover", "bonus"],
  ["Comets & Asteroids", "current"],
  ["Comets & Asteroids", "bonus"],
  ["Black Hole", "current"],
  ["Black Hole", "bonus"],
  ["Galaxy", "bonus"],
  ["The Sun", "bonus"],
];

const MISSION_XP = 100;
// `missions.type` is an admin-side lifecycle ENUM (does NOT include the game's
// "bonus"), so every seeded mission uses the safe default. The game's
// current/bonus distinction stays in the front-end `missionData`.
const MISSION_TYPE = "current";
const TEST_COUNT = 10;
const TEST_XP = 50;
const TEST_QUESTIONS = 5;

const slug = (value) =>
  value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const seed = async () => {
  // ── missions ──
  const missionRows = GAME_MISSIONS.map(([title, kind], index) => {
    const id = index + 1;
    // `kind` (current/bonus) only disambiguates the name; the stored type is the
    // admin ENUM value.
    return [id, `${slug(title)}_${kind}`, title, MISSION_XP, MISSION_TYPE];
  });

  const [mResult] = await pool.query(
    `INSERT INTO missions (id, name, label, xp, type)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       name  = VALUES(name),
       label = VALUES(label),
       xp    = VALUES(xp),
       type  = VALUES(type)`,
    [missionRows],
  );
  console.log(
    `Seeded ${missionRows.length} missions (affected rows: ${mResult.affectedRows})`,
  );

  // ── tests ── (game test ids are already 1-based, stored as-is)
  const testRows = Array.from({ length: TEST_COUNT }, (_, i) => {
    const id = i + 1;
    return [id, `test_${id}`, `Test ${id}`, TEST_XP, TEST_QUESTIONS];
  });

  const [tResult] = await pool.query(
    `INSERT INTO tests (id, name, label, xp, question_count)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       name           = VALUES(name),
       label          = VALUES(label),
       xp             = VALUES(xp),
       question_count = VALUES(question_count)`,
    [testRows],
  );
  console.log(
    `Seeded ${testRows.length} tests (affected rows: ${tResult.affectedRows})`,
  );

  await pool.end();
};

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
