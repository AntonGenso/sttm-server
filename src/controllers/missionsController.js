const services = require("../services/missionsService");
const { MAX_FACTS } = require("../middleware/upload");
const { unsupportedVideoCodec } = require("../utils/videoCodec");

const MISSION_TYPES = ["current", "bonuse"];

/** `Первая орбита` → `первая-орбита`: readable, and unique enough per mission. */
const toSlug = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

/** null for an empty field, false for something that is not an http(s) URL. */
const parseLink = (value) => {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : false;
  } catch {
    return false;
  }
};

/** Non-negative integer from a form field; `false` when the value is junk. */
const parseCount = (value) => {
  if (value === undefined || value === "") {
    return 0;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : false;
};

/**
 * The facts of a mission, sent as one JSON field beside the pictures.
 *
 * Shape per fact: `{ id?, titleRu, titleUz?, descriptionRu, descriptionUz?,
 * imageField?, keepImage? }` — `imageField` names one of the uploaded
 * `factImage_<n>` files, `keepImage` keeps the picture already stored.
 *
 * Returns `undefined` when the field was not sent at all (facts stay as they
 * are), `false` when it cannot be read, and the normalized list otherwise.
 */
const parseFacts = (value, files = {}) => {
  if (value === undefined) {
    return undefined;
  }

  let parsed;
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return false;
  }

  if (!Array.isArray(parsed) || parsed.length > MAX_FACTS) {
    return false;
  }

  const facts = [];
  for (const fact of parsed) {
    if (!fact || typeof fact !== "object") {
      return false;
    }

    const titleRu = String(fact.titleRu ?? "").trim();
    const descriptionRu = String(fact.descriptionRu ?? "").trim();
    if (!titleRu || !descriptionRu) {
      return false;
    }

    const imageField = fact.imageField ?? null;
    if (imageField !== null && !(imageField in files)) {
      return false;
    }

    const id =
      fact.id === undefined || fact.id === null ? null : Number(fact.id);
    if (id !== null && !Number.isInteger(id)) {
      return false;
    }

    facts.push({
      id,
      titleRu,
      titleUz: String(fact.titleUz ?? "").trim() || null,
      descriptionRu,
      descriptionUz: String(fact.descriptionUz ?? "").trim() || null,
      imageField,
      keepImage: Boolean(fact.keepImage),
    });
  }

  return facts;
};

/** Video fields, checked for a codec the students' browsers can decode. */
const VIDEO_FIELDS = ["videoRu", "videoUz"];

/**
 * Guards against a video that would upload happily and then play as sound over
 * a black rectangle. Returns the message to answer with, or null when the
 * files are fine.
 */
const videoCodecError = (files) => {
  for (const field of VIDEO_FIELDS) {
    const file = files[field];
    if (!file) continue;

    const codec = unsupportedVideoCodec(file.buffer);
    if (codec) {
      return `${field}: the video is encoded with ${codec}, which most browsers cannot play — they would give sound and a black picture. Re-encode it to H.264, for example: ffmpeg -i input.mp4 -c:v libx264 -crf 21 -pix_fmt yuv420p -c:a aac -movflags +faststart output.mp4`;
    }
  }

  return null;
};

/** multer's `fields()` gives an array per field; the form allows one file each. */
const collectFiles = (req) =>
  Object.fromEntries(
    Object.entries(req.files ?? {}).map(([field, list]) => [field, list[0]]),
  );

/**
 * Asset fields the client asked to clear. Multipart repeats the key instead of
 * sending an array, so both shapes arrive here.
 */
const collectRemovals = (value) => {
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .filter((item) => typeof item === "string")
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
};

const getMissions = async (req, res) => {
  try {
    const result = await services.getMissions();
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching missions" });
  }
};

const getMission = async (req, res) => {
  try {
    const result = await services.getMissionById(Number(req.params.id));
    res.json(result);
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    res.status(500).json({ message: "Error fetching mission" });
  }
};

/**
 * Multipart: text fields alongside the cover, the video, the student documents
 * and the teacher guides. Everything except the name is optional.
 */
const createMission = async (req, res) => {
  try {
    // The name used to arrive as a query parameter; the body is the source now.
    const missionName = req.body.missionName ?? req.query.missionName;

    if (typeof missionName !== "string" || !missionName.trim()) {
      return res.status(400).json({ message: "Mission name is required" });
    }

    const label = missionName.trim();
    const slug = toSlug(label);
    if (!slug) {
      return res.status(400).json({ message: "Mission name is invalid" });
    }

    const xp = req.body.xp === undefined || req.body.xp === "" ? 0 : Number(req.body.xp);
    if (!Number.isInteger(xp) || xp < 0) {
      return res
        .status(400)
        .json({ message: "XP must be a non-negative integer" });
    }

    const level = parseCount(req.body.level);
    if (level === false) {
      return res
        .status(400)
        .json({ message: "Level must be a non-negative integer" });
    }

    const type = req.body.type || "current";
    if (!MISSION_TYPES.includes(type)) {
      return res.status(400).json({ message: "Unknown mission type" });
    }

    const gameLink = parseLink(req.body.gameLink);
    if (gameLink === false) {
      return res.status(400).json({ message: "Game link must be a valid URL" });
    }

    const bonusXp =
      req.body.bonusXp === undefined || req.body.bonusXp === ""
        ? 0
        : Number(req.body.bonusXp);
    if (!Number.isInteger(bonusXp) || bonusXp < 0) {
      return res
        .status(400)
        .json({ message: "Bonus XP must be a non-negative integer" });
    }

    const files = collectFiles(req);

    const codecError = videoCodecError(files);
    if (codecError) {
      return res.status(400).json({ message: codecError });
    }

    const facts = parseFacts(req.body.facts, files);
    if (facts === false) {
      return res.status(400).json({
        message: `Facts are malformed; each needs a title and a description, up to ${MAX_FACTS} per mission`,
      });
    }

    const result = await services.createNewMission({
      name: slug,
      label,
      xp,
      level,
      type,
      gameLink,
      bonusXp,
      facts: facts ?? [],
      files,
    });

    res.status(201).json(result);
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    res.status(500).json({ message: "Error creating mission" });
  }
};

const ASSET_FIELDS = [
  "cover",
  "videoRu",
  "videoUz",
  "documentRu",
  "documentUz",
  "teacherGuideRu",
  "teacherGuideUz",
  "lessonNotesRu",
  "lessonNotesUz",
];

/**
 * Partial update: only the fields present in the request are touched. A file
 * replaces the stored one, a name listed in `remove` clears it, and an empty
 * `gameLink` clears the link.
 */
const updateMission = async (req, res) => {
  try {
    const fields = {};

    if (req.body.missionName !== undefined) {
      const label = String(req.body.missionName).trim();
      const slug = toSlug(label);
      if (!label || !slug) {
        return res.status(400).json({ message: "Mission name is invalid" });
      }
      fields.label = label;
      fields.name = slug;
    }

    if (req.body.xp !== undefined && req.body.xp !== "") {
      const xp = Number(req.body.xp);
      if (!Number.isInteger(xp) || xp < 0) {
        return res
          .status(400)
          .json({ message: "XP must be a non-negative integer" });
      }
      fields.xp = xp;
    }

    if (req.body.level !== undefined && req.body.level !== "") {
      const level = parseCount(req.body.level);
      if (level === false) {
        return res
          .status(400)
          .json({ message: "Level must be a non-negative integer" });
      }
      fields.level = level;
    }

    if (req.body.type !== undefined) {
      if (!MISSION_TYPES.includes(req.body.type)) {
        return res.status(400).json({ message: "Unknown mission type" });
      }
      fields.type = req.body.type;
    }

    // Multipart carries the flag as a string; treat "1"/"true" as visible.
    if (req.body.isActive !== undefined) {
      fields.isActive = ["1", "true"].includes(String(req.body.isActive))
        ? 1
        : 0;
    }

    if (req.body.gameLink !== undefined) {
      const gameLink = parseLink(req.body.gameLink);
      if (gameLink === false) {
        return res
          .status(400)
          .json({ message: "Game link must be a valid URL" });
      }
      fields.gameLink = gameLink;
    }

    if (req.body.bonusXp !== undefined && req.body.bonusXp !== "") {
      const bonusXp = Number(req.body.bonusXp);
      if (!Number.isInteger(bonusXp) || bonusXp < 0) {
        return res
          .status(400)
          .json({ message: "Bonus XP must be a non-negative integer" });
      }
      fields.bonusXp = bonusXp;
    }

    const remove = collectRemovals(req.body.remove);
    const unknown = remove.find((field) => !ASSET_FIELDS.includes(field));
    if (unknown) {
      return res.status(400).json({ message: `Unknown file field: ${unknown}` });
    }

    const files = collectFiles(req);

    const codecError = videoCodecError(files);
    if (codecError) {
      return res.status(400).json({ message: codecError });
    }

    const facts = parseFacts(req.body.facts, files);
    if (facts === false) {
      return res.status(400).json({
        message: `Facts are malformed; each needs a title and a description, up to ${MAX_FACTS} per mission`,
      });
    }

    const result = await services.updateMission(Number(req.params.id), {
      fields,
      files,
      remove,
      facts,
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    res.status(500).json({ message: "Error updating mission" });
  }
};

const deleteMission = async (req, res) => {
  try {
    await services.deleteMission(Number(req.params.id));
    res.status(204).send();
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    res.status(500).json({ message: "Error deleting mission" });
  }
};

module.exports = {
  createMission,
  getMissions,
  getMission,
  updateMission,
  deleteMission,
};
