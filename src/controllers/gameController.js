const services = require("../services/gameService");

/** Positive integer from a route param, or null when it isn't one. */
const parseId = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Non-negative integer from the body, or null when it isn't one. */
const parseScore = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

const getProfile = async (req, res) => {
  try {
    const profile = await services.getGameProfile(req.user.id);
    res.json(profile);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching game profile" });
  }
};

// Missions and tests share the same two handlers; `kind` picks the table.
const startHandler = (kind) => async (req, res) => {
  try {
    const itemId = parseId(req.params.id);
    if (!itemId) {
      return res.status(400).json({ message: `Invalid ${kind} id` });
    }
    const result = await services.startItem(kind, req.user.id, itemId);
    res.json(result);
  } catch (error) {
    console.error(error);
    if (error.status === 404) {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: `Error starting ${kind}` });
  }
};

const submitHandler = (kind) => async (req, res) => {
  try {
    const itemId = parseId(req.params.id);
    if (!itemId) {
      return res.status(400).json({ message: `Invalid ${kind} id` });
    }
    const score = parseScore(req.body.score);
    if (score === null) {
      return res.status(400).json({ message: "Score must be a non-negative integer" });
    }
    const result = await services.submitItem(kind, req.user.id, itemId, score);
    res.json(result);
  } catch (error) {
    console.error(error);
    if (error.status === 404) {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: `Error submitting ${kind} score` });
  }
};

const updateSkin = async (req, res) => {
  try {
    const headId = parseScore(req.body.headId);
    const suitId = parseScore(req.body.suitId);
    if (headId === null || suitId === null) {
      return res
        .status(400)
        .json({ message: "headId and suitId must be non-negative integers" });
    }
    const result = await services.updateSkin(req.user.id, headId, suitId);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating skin" });
  }
};

/** Longest name fragment the board will search for. */
const SEARCH_MAX_LENGTH = 64;

const getLeaderboard = async (req, res) => {
  try {
    const page = parseId(req.query.page) ?? 1;
    const requested = parseId(req.query.pageSize);
    const pageSize = Math.min(
      requested ?? services.LEADERBOARD_PAGE_SIZE,
      services.LEADERBOARD_MAX_PAGE_SIZE,
    );
    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim().slice(0, SEARCH_MAX_LENGTH)
        : "";

    // `scope=class` is the student's own class, looked up from the token. An
    // explicit `classId` stays supported for callers that already know one.
    let classId = null;
    if (req.query.scope === "class") {
      classId = await services.getOwnClassId(req.user.id);
      if (!classId) {
        // Not in any class: an empty board is the honest answer, not the
        // global one the filter was meant to narrow.
        return res.json({
          entries: [],
          page: 1,
          pageSize,
          total: 0,
          totalPages: 1,
        });
      }
    } else if (req.query.classId) {
      classId = parseId(req.query.classId);
    }

    const result = await services.getLeaderboard({
      classId,
      search,
      page,
      pageSize,
    });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching leaderboard" });
  }
};

module.exports = {
  getProfile,
  startMission: startHandler("mission"),
  submitMission: submitHandler("mission"),
  startTest: startHandler("test"),
  submitTest: submitHandler("test"),
  updateSkin,
  getLeaderboard,
};
