const services = require("../services/testsService");
const { OPTIONS } = require("../services/testsService");

/**
 * The reward is not part of the payload: a test is worth ten points per
 * question, and the service derives it. An `xp` sent by a client is ignored
 * rather than rejected, so an older form cannot set a reward that contradicts
 * the questions.
 */

/** How many questions one test may carry — a guard, not a target. */
const MAX_QUESTIONS = 50;

/** `Тест: Земля` → `тест-земля`: readable, and unique enough per test. */
const toSlug = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

/** Non-negative integer from a form field; `false` when the value is junk. */
const parseCount = (value) => {
  if (value === undefined || value === "") {
    return 0;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : false;
};

/**
 * Tests are scheduled in Tashkent time and stored in UTC — the same contract as
 * missions, so the two schedules cannot drift apart.
 *
 * Returns `undefined` when the field was not sent, `null` for an empty one
 * ("opens immediately"), `false` when it cannot be read, and a
 * `YYYY-MM-DD HH:MM:SS` UTC string otherwise.
 */
const TASHKENT_OFFSET = "+05:00";

const parseOpensAt = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const raw = value.trim();
  const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw);
  const parsed = new Date(local ? `${raw}${TASHKENT_OFFSET}` : raw);

  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.toISOString().slice(0, 19).replace("T", " ");
};

/**
 * The questions of a test, sent as one JSON field.
 *
 * Shape per question: `{ id?, textRu, textUz?, optionsRu: {A,B,C,D},
 * optionsUz?: {A,B,C,D}, correctOption }`. Russian text and all four Russian
 * options are required; the Uzbek side is optional throughout, and an empty
 * Uzbek option means "show the Russian one".
 *
 * Returns `undefined` when the field was not sent at all (questions stay as
 * they are), `false` when it cannot be read, and the normalized list otherwise.
 */
const parseQuestions = (value) => {
  if (value === undefined) {
    return undefined;
  }

  let parsed;
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return false;
  }

  if (!Array.isArray(parsed) || parsed.length > MAX_QUESTIONS) {
    return false;
  }

  const questions = [];
  for (const question of parsed) {
    if (!question || typeof question !== "object") {
      return false;
    }

    const textRu = String(question.textRu ?? "").trim();
    if (!textRu) {
      return false;
    }

    const correctOption = String(question.correctOption ?? "").toUpperCase();
    if (!OPTIONS.includes(correctOption)) {
      return false;
    }

    const optionsRu = {};
    const optionsUz = {};
    for (const letter of OPTIONS) {
      const ru = String(question.optionsRu?.[letter] ?? "").trim();
      if (!ru) {
        return false;
      }
      optionsRu[letter] = ru;
      optionsUz[letter] = String(question.optionsUz?.[letter] ?? "").trim() || null;
    }

    const id =
      question.id === undefined || question.id === null
        ? null
        : Number(question.id);
    if (id !== null && !Number.isInteger(id)) {
      return false;
    }

    questions.push({
      id,
      textRu,
      textUz: String(question.textUz ?? "").trim() || null,
      optionsRu,
      optionsUz,
      correctOption,
    });
  }

  return questions;
};

/** multer's `fields()` gives an array per field; the form allows one file. */
const collectFiles = (req) =>
  Object.fromEntries(
    Object.entries(req.files ?? {}).map(([field, list]) => [field, list[0]]),
  );

/** Answers a validation failure the same way across both write endpoints. */
const badRequest = (res, message, field) =>
  res.status(400).json({ message, ...(field ? { field } : {}) });

const getTests = async (req, res) => {
  try {
    res.json(await services.getTests());
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching tests" });
  }
};

const getTest = async (req, res) => {
  try {
    res.json(await services.getTestById(Number(req.params.id)));
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    res.status(500).json({ message: "Error fetching the test" });
  }
};

/**
 * The test as the game plays it: published tests only.
 *
 * It carries the right answer to each question, because the quiz marks an
 * answer correct the moment it is picked — exactly as the hardcoded catalog it
 * replaces did. Grading on the server would be the way to keep the key from the
 * client; that is a change to the submit flow, not to this endpoint.
 */
const getTestForPlay = async (req, res) => {
  try {
    res.json(await services.getPublishedTestById(Number(req.params.id)));
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    res.status(500).json({ message: "Error fetching the test" });
  }
};

/** Multipart: the text fields alongside the cover. */
const createTest = async (req, res) => {
  try {
    const testName = req.body.testName;
    if (typeof testName !== "string" || !testName.trim()) {
      return badRequest(res, "Test name is required", "testName");
    }

    const label = testName.trim();
    const slug = toSlug(label);
    if (!slug) {
      return badRequest(res, "Test name is invalid", "testName");
    }

    const level = parseCount(req.body.level);
    if (level === false) {
      return badRequest(res, "Level must be a non-negative integer", "level");
    }

    const opensAt = parseOpensAt(req.body.opensAt);
    if (opensAt === false) {
      return badRequest(res, "Opening date must be a valid date and time", "opensAt");
    }

    // Multipart carries the flag as a string; treat "1"/"true" as visible.
    const isActive =
      req.body.isActive === undefined
        ? 1
        : ["1", "true"].includes(String(req.body.isActive))
          ? 1
          : 0;

    const questions = parseQuestions(req.body.questions);
    if (questions === false) {
      return badRequest(
        res,
        `Questions are malformed; each needs its text, four Russian options and a correct one, up to ${MAX_QUESTIONS} per test`,
        "questions",
      );
    }

    const result = await services.createTest({
      name: slug,
      label,
      level,
      isActive,
      opensAt,
      questions: questions ?? [],
      files: collectFiles(req),
    });

    res.status(201).json(result);
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res
        .status(error.status)
        .json({ message: error.message, ...(error.field ? { field: error.field } : {}) });
    }
    res.status(500).json({ message: "Error creating the test" });
  }
};

/**
 * Partial update: only the fields present in the request are touched. A file
 * replaces the stored cover, and `removeCover` clears it.
 */
const updateTest = async (req, res) => {
  try {
    const fields = {};

    if (req.body.testName !== undefined) {
      const label = String(req.body.testName).trim();
      const slug = toSlug(label);
      if (!label || !slug) {
        return badRequest(res, "Test name is invalid", "testName");
      }
      fields.label = label;
      fields.name = slug;
    }

    if (req.body.level !== undefined && req.body.level !== "") {
      const level = parseCount(req.body.level);
      if (level === false) {
        return badRequest(res, "Level must be a non-negative integer", "level");
      }
      fields.level = level;
    }

    // An empty value clears the date, so the field is honoured even when blank.
    const opensAt = parseOpensAt(req.body.opensAt);
    if (opensAt === false) {
      return badRequest(res, "Opening date must be a valid date and time", "opensAt");
    }
    if (opensAt !== undefined) {
      fields.opensAt = opensAt;
    }

    if (req.body.isActive !== undefined) {
      fields.isActive = ["1", "true"].includes(String(req.body.isActive)) ? 1 : 0;
    }

    const questions = parseQuestions(req.body.questions);
    if (questions === false) {
      return badRequest(
        res,
        `Questions are malformed; each needs its text, four Russian options and a correct one, up to ${MAX_QUESTIONS} per test`,
        "questions",
      );
    }

    const result = await services.updateTest(Number(req.params.id), {
      fields,
      files: collectFiles(req),
      removeCover: ["1", "true"].includes(String(req.body.removeCover)),
      questions,
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res
        .status(error.status)
        .json({ message: error.message, ...(error.field ? { field: error.field } : {}) });
    }
    res.status(500).json({ message: "Error updating the test" });
  }
};

const deleteTest = async (req, res) => {
  try {
    await services.deleteTest(Number(req.params.id));
    res.status(204).send();
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    res.status(500).json({ message: "Error deleting the test" });
  }
};

module.exports = {
  MAX_QUESTIONS,
  getTests,
  getTest,
  getTestForPlay,
  createTest,
  updateTest,
  deleteTest,
};
