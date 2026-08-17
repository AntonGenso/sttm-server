const crypto = require("crypto");
const path = require("path");
const minioClient = require("../config/minio");
const {
  PUBLIC_BUCKET,
  PRIVATE_BUCKET,
  PUBLIC_BASE_URL,
  ensureBuckets,
} = require("../config/storage");

/** How long a link to a private object stays valid, in seconds. */
const PRIVATE_URL_TTL = 15 * 60;

/**
 * What a mission file can be. `bucket` decides who may read it, `folder` and
 * `localized` shape the object key.
 */
const MISSION_ASSETS = {
  cover: { bucket: PUBLIC_BUCKET, folder: "cover", localized: false },
  video: { bucket: PUBLIC_BUCKET, folder: "video", localized: true },
  material: { bucket: PRIVATE_BUCKET, folder: "materials", localized: true },
  teacherGuide: {
    bucket: PRIVATE_BUCKET,
    folder: "teacher-guide",
    localized: true,
  },
  lessonNotes: {
    bucket: PRIVATE_BUCKET,
    folder: "lesson-notes",
    localized: true,
  },
};

/** Keys stay ascii: the original file name is kept in the database instead. */
const safeExtension = (originalName) => {
  const extension = path.extname(originalName || "").toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : "";
};

/**
 * `missions/12/teacher-guide/ru/9f3a....pdf`
 *
 * Built from the mission id, so renaming a mission never moves an object, and
 * from a fresh uuid, so uploading a replacement never overwrites the old file —
 * the swap happens when the database starts pointing at the new key.
 */
const buildMissionKey = (missionId, kind, originalName, locale) => {
  const asset = MISSION_ASSETS[kind];
  if (!asset) {
    throw new Error(`Unknown mission asset kind: ${kind}`);
  }

  const segments = ["missions", String(missionId), asset.folder];
  if (asset.localized) {
    segments.push(locale);
  }
  segments.push(`${crypto.randomUUID()}${safeExtension(originalName)}`);

  return segments.join("/");
};

/** Uploads a multer memory-storage file and returns the object key. */
const uploadMissionAsset = async ({ missionId, kind, locale, file }) => {
  const asset = MISSION_ASSETS[kind];
  if (!asset) {
    throw new Error(`Unknown mission asset kind: ${kind}`);
  }

  await ensureBuckets();

  const key = buildMissionKey(missionId, kind, file.originalname, locale);

  await minioClient.putObject(asset.bucket, key, file.buffer, file.size, {
    "Content-Type": file.mimetype || "application/octet-stream",
    // Keys are unique per upload, so an object is safe to cache forever.
    "Cache-Control": "public, max-age=31536000, immutable",
  });

  return key;
};

const removeMissionAsset = async (kind, key) => {
  if (!key) {
    return;
  }
  const asset = MISSION_ASSETS[kind];
  await minioClient.removeObject(asset.bucket, key);
};

/** Public objects are served straight from MinIO — no signature involved. */
const getPublicUrl = (key) =>
  key ? `${PUBLIC_BASE_URL}/${PUBLIC_BUCKET}/${key}` : null;

/**
 * Private objects are handed out as short-lived signed links. `originalName`
 * comes back as the file name shown to the browser, which is why keys can stay
 * ascii.
 *
 * The link opens the file inline — a PDF renders in a new browser tab rather
 * than downloading — while still carrying the original name for a manual save.
 */
const getPrivateUrl = async (key, originalName) => {
  if (!key) {
    return null;
  }

  await ensureBuckets();

  const headers = originalName
    ? {
        "response-content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(
          originalName,
        )}`,
      }
    : {};

  return minioClient.presignedGetObject(
    PRIVATE_BUCKET,
    key,
    PRIVATE_URL_TTL,
    headers,
  );
};

const listByPrefix = (bucket, prefix) =>
  new Promise((resolve, reject) => {
    const keys = [];
    const stream = minioClient.listObjectsV2(bucket, prefix, true);
    stream.on("data", (object) => keys.push(object.name));
    stream.on("end", () => resolve(keys));
    stream.on("error", reject);
  });

/**
 * Wipes everything stored for a mission, in both buckets.
 *
 * Deleting by prefix rather than by the keys held in the database also collects
 * objects orphaned by a failed upload earlier on.
 */
const removeMissionObjects = async (missionId) => {
  await ensureBuckets();

  const prefix = `missions/${missionId}/`;

  for (const bucket of [PUBLIC_BUCKET, PRIVATE_BUCKET]) {
    const keys = await listByPrefix(bucket, prefix);
    if (keys.length) {
      await minioClient.removeObjects(bucket, keys);
    }
  }
};

module.exports = {
  MISSION_ASSETS,
  PRIVATE_URL_TTL,
  buildMissionKey,
  uploadMissionAsset,
  removeMissionAsset,
  removeMissionObjects,
  getPublicUrl,
  getPrivateUrl,
};
