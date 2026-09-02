const pool = require("../config/db");
const storageService = require("./storageService");

/**
 * `tests.opens_at` holds UTC, but a bare DATETIME would be re-interpreted by
 * the driver in the Node process' timezone on the way out. Formatting it in SQL
 * hands the client a plain ISO string instead, identical on every host — the
 * same trick the mission catalog uses.
 */
const OPENS_AT_SELECT = "DATE_FORMAT(t.opens_at, '%Y-%m-%dT%TZ') AS opens_at";

/** The four options are fixed: the game renders exactly A–D, one of them right. */
const OPTIONS = ["A", "B", "C", "D"];

/**
 * What one correct answer is worth. A test's reward is not typed in — it is
 * simply ten points per question, so a seven-question test is worth 70. Keeping
 * it derived means the reward can never drift from the questions that earn it.
 */
const POINTS_PER_QUESTION = 10;

const rewardFor = (questionCount) => questionCount * POINTS_PER_QUESTION;

/**
 * Two tests may not share a number: `level` both names the test («Тест 07») and
 * orders the list, so a duplicate would make the order arbitrary. The database
 * enforces it with `uq_tests_level`; this turns the driver's error into an
 * answer the form can show against the field.
 */
const asDuplicateLevel = (error) => {
  if (error.code === "ER_DUP_ENTRY" && String(error.message).includes("uq_tests_level")) {
    const conflict = new Error("A test with this level already exists");
    conflict.status = 409;
    conflict.field = "level";
    return conflict;
  }
  return error;
};

/**
 * Questions of a test, in the order they are asked.
 *
 * Both locales are handed out — the client picks one and falls back to Russian
 * where the Uzbek text was left empty, exactly as mission facts do.
 */
const listQuestions = async (testId, executor = pool) => {
  const [rows] = await executor.query(
    `SELECT id, position, text_ru, text_uz,
            option_a_ru, option_b_ru, option_c_ru, option_d_ru,
            option_a_uz, option_b_uz, option_c_uz, option_d_uz,
            correct_option
       FROM test_questions
      WHERE test_id = ?
      ORDER BY position, id`,
    [testId],
  );

  return rows.map((question) => ({
    id: question.id,
    position: question.position,
    text: { ru: question.text_ru, uz: question.text_uz },
    options: Object.fromEntries(
      OPTIONS.map((letter) => [
        letter,
        {
          ru: question[`option_${letter.toLowerCase()}_ru`],
          uz: question[`option_${letter.toLowerCase()}_uz`],
        },
      ]),
    ),
    correct_option: question.correct_option,
  }));
};

/**
 * Replaces the test's questions with the list the form sent.
 *
 * The list is authoritative: a question carrying an `id` is updated, one
 * without is created, and a stored question missing from the list is deleted.
 * `tests.question_count` is kept in step here rather than being typed in — it
 * is simply how many questions the test ended up with.
 */
const replaceQuestions = async (testId, questions, executor = pool) => {
  const [stored] = await executor.query(
    "SELECT id FROM test_questions WHERE test_id = ?",
    [testId],
  );
  const storedIds = new Set(stored.map((question) => question.id));
  const keptIds = new Set();

  for (const [index, question] of questions.entries()) {
    const values = [
      index,
      question.textRu,
      question.textUz,
      question.optionsRu.A,
      question.optionsRu.B,
      question.optionsRu.C,
      question.optionsRu.D,
      question.optionsUz.A,
      question.optionsUz.B,
      question.optionsUz.C,
      question.optionsUz.D,
      question.correctOption,
    ];

    if (question.id && storedIds.has(question.id)) {
      await executor.query(
        `UPDATE test_questions
            SET position = ?, text_ru = ?, text_uz = ?,
                option_a_ru = ?, option_b_ru = ?, option_c_ru = ?, option_d_ru = ?,
                option_a_uz = ?, option_b_uz = ?, option_c_uz = ?, option_d_uz = ?,
                correct_option = ?
          WHERE id = ? AND test_id = ?`,
        [...values, question.id, testId],
      );
      keptIds.add(question.id);
    } else {
      await executor.query(
        `INSERT INTO test_questions
           (test_id, position, text_ru, text_uz,
            option_a_ru, option_b_ru, option_c_ru, option_d_ru,
            option_a_uz, option_b_uz, option_c_uz, option_d_uz,
            correct_option)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [testId, ...values],
      );
    }
  }

  const removed = stored.filter((question) => !keptIds.has(question.id));
  if (removed.length) {
    await executor.query(
      `DELETE FROM test_questions WHERE test_id = ? AND id IN (${removed
        .map(() => "?")
        .join(", ")})`,
      [testId, ...removed.map((question) => question.id)],
    );
  }

  // The count and the reward both follow from the list, so they are written
  // here rather than being trusted from the form.
  await executor.query(
    "UPDATE tests SET question_count = ?, xp = ? WHERE id = ?",
    [questions.length, rewardFor(questions.length), testId],
  );
};

/**
 * The catalog. Deliberately carries no questions: this is what fills the cards,
 * and the correct answers have no business travelling with a list.
 */
const getTests = async () => {
  const [rows] = await pool.query(
    `SELECT t.id, t.name, t.label, t.xp, t.level, t.question_count,
            t.is_active, ${OPENS_AT_SELECT}, t.cover_key,
            t.created_at
       FROM tests t
      ORDER BY t.level, t.id`,
  );

  return rows.map(({ cover_key, ...test }) => ({
    ...test,
    cover_url: storageService.getPublicUrl(cover_key),
  }));
};

/** One test with its questions and the right answer to each. */
const getTestById = async (id) => {
  const [rows] = await pool.query(
    `SELECT t.id, t.name, t.label, t.xp, t.level, t.question_count,
            t.is_active, ${OPENS_AT_SELECT}, t.cover_key,
            t.created_at
       FROM tests t
      WHERE t.id = ?`,
    [id],
  );

  const test = rows[0];
  if (!test) {
    const error = new Error("Test not found");
    error.status = 404;
    throw error;
  }

  const { cover_key, ...rest } = test;

  return {
    ...rest,
    cover_url: storageService.getPublicUrl(cover_key),
    questions: await listQuestions(test.id),
  };
};

/**
 * The same test, but only if a student is allowed to see it.
 *
 * The panel reads `getTestById` and must see everything, drafts included. The
 * game reads this: a hidden test, or one whose opening date has not arrived, is
 * indistinguishable from a test that does not exist. `opens_at` is compared in
 * SQL against UTC now, so a wrong clock on the player's machine cannot open a
 * test early.
 */
const getPublishedTestById = async (id) => {
  const [rows] = await pool.query(
    `SELECT id FROM tests
      WHERE id = ? AND is_active = 1
        AND (opens_at IS NULL OR opens_at <= UTC_TIMESTAMP())`,
    [id],
  );

  if (!rows.length) {
    const error = new Error("Test not found");
    error.status = 404;
    throw error;
  }

  return getTestById(id);
};

/**
 * Creates the test, then uploads its cover.
 *
 * The row goes in first because the object key is built from the test id
 * (`tests/{id}/cover/...`). If the upload then fails, the test and the object
 * are removed, so no half-created test is left behind — the same order the
 * mission catalog uses.
 */
const createTest = async ({
  name,
  label,
  level = 0,
  isActive = 1,
  opensAt = null,
  questions = [],
  files = {},
}) => {
  const connection = await pool.getConnection();
  let testId = null;

  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO tests (name, label, xp, level, is_active, opens_at, question_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        label,
        rewardFor(questions.length),
        level,
        isActive,
        opensAt,
        questions.length,
      ],
    );
    testId = result.insertId;

    if (questions.length) {
      await replaceQuestions(testId, questions, connection);
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error(error);
    throw asDuplicateLevel(error);
  }

  connection.release();

  if (files.cover) {
    try {
      const key = await storageService.uploadTestCover({
        testId,
        file: files.cover,
      });
      await pool.query("UPDATE tests SET cover_key = ? WHERE id = ?", [
        key,
        testId,
      ]);
    } catch (error) {
      console.error(error);
      await pool
        .query("DELETE FROM tests WHERE id = ?", [testId])
        .catch((cleanupError) =>
          console.error("Failed to remove orphan test", cleanupError),
        );
      const failure = new Error("Error uploading the test cover");
      failure.status = 502;
      throw failure;
    }
  }

  return getTestById(testId);
};

/**
 * Partial update: only the fields present in the request are touched.
 *
 * A new cover is uploaded under a fresh key and the row is repointed before the
 * old object is deleted — at no moment does the row point at a key that no
 * longer exists.
 */
const updateTest = async (testId, { fields = {}, files = {}, removeCover = false, questions }) => {
  // Also serves as the existence check for the whole operation.
  await getTestById(testId);

  // `xp` is deliberately absent: it is derived from the questions, never set.
  const columns = {
    name: "name",
    label: "label",
    level: "level",
    isActive: "is_active",
    opensAt: "opens_at",
  };
  const assignments = Object.entries(columns)
    .filter(([field]) => fields[field] !== undefined)
    .map(([field, column]) => ({ column, value: fields[field] }));

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    if (assignments.length) {
      await connection.query(
        `UPDATE tests SET ${assignments
          .map(({ column }) => `${column} = ?`)
          .join(", ")} WHERE id = ?`,
        [...assignments.map(({ value }) => value), testId],
      );
    }

    // `questions` absent means the caller is not editing them; an empty array
    // means "remove them all".
    if (questions) {
      await replaceQuestions(testId, questions, connection);
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error(error);
    throw asDuplicateLevel(error);
  }
  connection.release();

  const [[stored]] = await pool.query(
    "SELECT cover_key FROM tests WHERE id = ?",
    [testId],
  );
  const oldKey = stored?.cover_key ?? null;

  if (files.cover) {
    let key = null;
    try {
      key = await storageService.uploadTestCover({ testId, file: files.cover });
      await pool.query("UPDATE tests SET cover_key = ? WHERE id = ?", [key, testId]);
    } catch (error) {
      console.error(error);
      // The row still points at the old object, so only the new one is orphaned.
      if (key) {
        await storageService
          .removeTestCover(key)
          .catch((cleanupError) =>
            console.error("Failed to remove orphan cover", cleanupError),
          );
      }
      const failure = new Error("Error uploading the test cover");
      failure.status = 502;
      throw failure;
    }

    // Nothing points at it any more; a failure here only leaves dead bytes.
    if (oldKey) {
      await storageService
        .removeTestCover(oldKey)
        .catch((error) => console.error("Failed to remove replaced cover", error));
    }
  } else if (removeCover && oldKey) {
    await pool.query("UPDATE tests SET cover_key = NULL WHERE id = ?", [testId]);
    await storageService
      .removeTestCover(oldKey)
      .catch((error) => console.error("Failed to remove cover", error));
  }

  return getTestById(testId);
};

/**
 * Removes the test row (cascading to `test_questions` and to student progress)
 * and its objects. The row goes first: a leftover object is cheap, a row
 * pointing at a deleted file is a broken card.
 */
const deleteTest = async (testId) => {
  const [result] = await pool.query("DELETE FROM tests WHERE id = ?", [testId]);

  if (!result.affectedRows) {
    const error = new Error("Test not found");
    error.status = 404;
    throw error;
  }

  try {
    await storageService.removeTestObjects(testId);
  } catch (error) {
    console.error("Failed to remove test objects", error);
  }
};

module.exports = {
  OPTIONS,
  POINTS_PER_QUESTION,
  getTests,
  getTestById,
  getPublishedTestById,
  createTest,
  updateTest,
  deleteTest,
};
