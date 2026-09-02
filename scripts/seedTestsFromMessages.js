/**
 * Moves the ten hardcoded game tests into the database.
 *
 * Until now a test existed in two places at once: its questions in the game's
 * `messages/{ru,uz}.json` and the right answers as letters in `testData.ts`,
 * while `tests` held nothing but a name and an XP figure. This script folds
 * both into the catalog the admin panel edits.
 *
 * The payload was extracted from those two files into `data/tests-seed.json`,
 * so this script has no dependency on the front-end repository and the data it
 * writes can be reviewed on its own.
 *
 * Run with `npm run seed:tests`. Safe to re-run: tests are matched by their
 * `level`, and a match is updated in place rather than duplicated — the level
 * is unique, so a second run cannot create a second copy of the same test.
 *
 * The reward is not seeded: `xp` is ten points per question, derived by the
 * service, so each of these five-question tests ends up worth 50.
 */
const fs = require("fs");
const path = require("path");
const pool = require("../src/config/db");
const testsService = require("../src/services/testsService");

const SEED_PATH = path.join(__dirname, "data", "tests-seed.json");

/** `Comets & Asteroids` → `comets-asteroids`, the same rule the controller uses. */
const toSlug = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

/** The seed carries no ids; questions are rewritten wholesale on every run. */
const toQuestionInput = (question) => ({
  id: null,
  textRu: question.textRu,
  textUz: question.textUz || null,
  optionsRu: question.optionsRu,
  optionsUz: Object.fromEntries(
    Object.entries(question.optionsUz).map(([letter, text]) => [
      letter,
      text || null,
    ]),
  ),
  correctOption: question.correctOption,
});

const seed = async () => {
  const tests = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
  console.log(`Seeding ${tests.length} tests from ${path.basename(SEED_PATH)}`);

  const [existing] = await pool.query("SELECT id, level FROM tests");
  const byLevel = new Map(existing.map((row) => [row.level, row.id]));

  for (const test of tests) {
    const questions = test.questions.map(toQuestionInput);
    const storedId = byLevel.get(test.level);

    // A test already sitting on this level is the same test: it was seeded by
    // `seedGameCatalog` as "Test N" and is now getting its real name and its
    // questions. Replacing in place keeps `student_tests` progress attached.
    const saved = storedId
      ? await testsService.updateTest(storedId, {
          fields: { name: toSlug(test.label), label: test.label },
          questions,
        })
      : await testsService.createTest({
          name: toSlug(test.label),
          label: test.label,
          level: test.level,
          questions,
        });

    console.log(
      `  ${storedId ? "updated" : "created"} #${saved.id}  L${saved.level}  ` +
        `${saved.label} — ${saved.question_count} questions, ${saved.xp} XP`,
    );
  }
};

seed()
  .then(() => pool.end())
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Seeding failed:", error.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
