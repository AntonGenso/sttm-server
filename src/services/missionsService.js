const pool = require("../config/db");
const storageService = require("./storageService");

/** Uploaded file → the `mission_info` columns that store it. */
const ASSET_COLUMNS = {
  cover: { key: "cover_key", name: null, kind: "cover" },
  video: { key: "video_key", name: "video_name", kind: "video" },
  documentRu: {
    key: "document_link_ru",
    name: "document_name_ru",
    kind: "material",
    locale: "ru",
  },
  documentUz: {
    key: "document_link_uz",
    name: "document_name_uz",
    kind: "material",
    locale: "uz",
  },
  teacherGuideRu: {
    key: "teacher_guide_ru",
    name: "teacher_guide_name_ru",
    kind: "teacherGuide",
    locale: "ru",
  },
  teacherGuideUz: {
    key: "teacher_guide_uz",
    name: "teacher_guide_name_uz",
    kind: "teacherGuide",
    locale: "uz",
  },
};

const getMissions = async () => {
  try {
    const [rows] = await pool.query(
      `SELECT m.id, m.name, m.label, m.xp, m.type, m.created_at,
              mi.cover_key, mi.video_key, mi.game_link
         FROM missions m
         LEFT JOIN mission_info mi ON mi.mission_id = m.id
        ORDER BY m.id`,
    );

    return rows.map(({ cover_key, video_key, ...mission }) => ({
      ...mission,
      cover_url: storageService.getPublicUrl(cover_key),
      video_url: storageService.getPublicUrl(video_key),
    }));
  } catch (error) {
    console.error(error);
    throw new Error("Error gettiong missions");
  }
};

/**
 * Full mission card. Documents live in the private bucket, so they come back as
 * signed links that expire — never as bare object keys.
 */
const getMissionById = async (id) => {
  const [rows] = await pool.query(
    `SELECT m.id, m.name, m.label, m.xp, m.type, m.created_at, m.updated_at,
            mi.game_link, mi.cover_key,
            mi.video_key, mi.video_name,
            mi.document_link_ru, mi.document_name_ru,
            mi.document_link_uz, mi.document_name_uz,
            mi.teacher_guide_ru, mi.teacher_guide_name_ru,
            mi.teacher_guide_uz, mi.teacher_guide_name_uz
       FROM missions m
       LEFT JOIN mission_info mi ON mi.mission_id = m.id
      WHERE m.id = ?`,
    [id],
  );

  const mission = rows[0];
  if (!mission) {
    const error = new Error("Mission not found");
    error.status = 404;
    throw error;
  }

  const [documentRu, documentUz, teacherGuideRu, teacherGuideUz] =
    await Promise.all([
      storageService.getPrivateUrl(
        mission.document_link_ru,
        mission.document_name_ru,
      ),
      storageService.getPrivateUrl(
        mission.document_link_uz,
        mission.document_name_uz,
      ),
      storageService.getPrivateUrl(
        mission.teacher_guide_ru,
        mission.teacher_guide_name_ru,
      ),
      storageService.getPrivateUrl(
        mission.teacher_guide_uz,
        mission.teacher_guide_name_uz,
      ),
    ]);

  return {
    id: mission.id,
    name: mission.name,
    label: mission.label,
    xp: mission.xp,
    type: mission.type,
    created_at: mission.created_at,
    updated_at: mission.updated_at,
    game_link: mission.game_link,
    cover_url: storageService.getPublicUrl(mission.cover_key),
    video_url: storageService.getPublicUrl(mission.video_key),
    video_name: mission.video_name,
    documents: {
      ru: { url: documentRu, name: mission.document_name_ru },
      uz: { url: documentUz, name: mission.document_name_uz },
    },
    teacher_guide: {
      ru: { url: teacherGuideRu, name: mission.teacher_guide_name_ru },
      uz: { url: teacherGuideUz, name: mission.teacher_guide_name_uz },
    },
  };
};

/** Deletes the mission row (cascading to `mission_info`) and its objects. */
const rollbackMission = async (missionId, uploaded) => {
  await Promise.all(
    uploaded.map(({ field, key }) =>
      storageService
        .removeMissionAsset(ASSET_COLUMNS[field].kind, key)
        .catch((error) =>
          console.error("Failed to remove orphan object", error),
        ),
    ),
  );
  await pool
    .query("DELETE FROM missions WHERE id = ?", [missionId])
    .catch((error) => console.error("Failed to remove orphan mission", error));
};

/**
 * Creates the mission and uploads its files.
 *
 * The row goes in first because object keys are built from the mission id
 * (`missions/{id}/...`). If an upload then fails, the mission and everything
 * already uploaded are removed, so no half-created mission is left behind.
 */
const createNewMission = async ({
  name,
  label,
  xp = 0,
  type = "current",
  gameLink = null,
  files = {},
}) => {
  const connection = await pool.getConnection();
  let missionId = null;

  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      "INSERT INTO missions (name, label, xp, type) VALUES (?, ?, ?, ?)",
      [name, label, xp, type],
    );
    missionId = result.insertId;

    await connection.query(
      "INSERT INTO mission_info (mission_id, game_link) VALUES (?, ?)",
      [missionId, gameLink],
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error(error);
    throw new Error("Can't create mission");
  }

  connection.release();

  const uploaded = [];
  try {
    for (const [field, column] of Object.entries(ASSET_COLUMNS)) {
      const file = files[field];
      if (!file) {
        continue;
      }

      const key = await storageService.uploadMissionAsset({
        missionId,
        kind: column.kind,
        locale: column.locale,
        file,
      });
      uploaded.push({ field, key });

      const assignments = column.name
        ? `${column.key} = ?, ${column.name} = ?`
        : `${column.key} = ?`;
      const values = column.name
        ? [key, file.originalname, missionId]
        : [key, missionId];

      await pool.query(
        `UPDATE mission_info SET ${assignments} WHERE mission_id = ?`,
        values,
      );
    }
  } catch (error) {
    console.error(error);
    await rollbackMission(missionId, uploaded);
    const failure = new Error("Error uploading mission files");
    failure.status = 502;
    throw failure;
  }

  return getMissionById(missionId);
};

/** Object keys currently stored for the mission, per asset field. */
const getStoredKeys = async (missionId) => {
  const columns = Object.values(ASSET_COLUMNS)
    .map((column) => column.key)
    .join(", ");

  const [rows] = await pool.query(
    `SELECT ${columns} FROM mission_info WHERE mission_id = ?`,
    [missionId],
  );

  const stored = rows[0];
  if (!stored) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(ASSET_COLUMNS).map(([field, column]) => [
      field,
      stored[column.key],
    ]),
  );
};

/**
 * Updates the mission and, for every file sent, replaces the stored object.
 *
 * A replacement is uploaded under a new key and the database is repointed
 * before the old object is deleted — at no moment does a row point at a key
 * that no longer exists. Fields listed in `remove` are cleared the same way.
 */
const updateMission = async (missionId, { fields = {}, files = {}, remove = [] }) => {
  // Also serves as the existence check for the whole operation.
  await getMissionById(missionId);

  const storedKeys = await getStoredKeys(missionId);
  const uploaded = [];
  const replaced = [];

  try {
    const missionColumns = { name: "name", label: "label", xp: "xp", type: "type" };
    const missionAssignments = Object.entries(missionColumns)
      .filter(([field]) => fields[field] !== undefined)
      .map(([field, column]) => ({ column, value: fields[field] }));

    if (missionAssignments.length) {
      await pool.query(
        `UPDATE missions SET ${missionAssignments
          .map(({ column }) => `${column} = ?`)
          .join(", ")} WHERE id = ?`,
        [...missionAssignments.map(({ value }) => value), missionId],
      );
    }

    const infoColumns = { gameLink: "game_link" };
    const infoAssignments = Object.entries(infoColumns)
      .filter(([field]) => fields[field] !== undefined)
      .map(([field, column]) => ({ column, value: fields[field] }));

    if (infoAssignments.length) {
      await pool.query(
        `UPDATE mission_info SET ${infoAssignments
          .map(({ column }) => `${column} = ?`)
          .join(", ")} WHERE mission_id = ?`,
        [...infoAssignments.map(({ value }) => value), missionId],
      );
    }

    for (const [field, column] of Object.entries(ASSET_COLUMNS)) {
      const file = files[field];
      const shouldRemove = remove.includes(field) && !file;

      if (!file && !shouldRemove) {
        continue;
      }

      let key = null;
      if (file) {
        key = await storageService.uploadMissionAsset({
          missionId,
          kind: column.kind,
          locale: column.locale,
          file,
        });
        uploaded.push({ field, key });
      }

      const assignments = column.name
        ? `${column.key} = ?, ${column.name} = ?`
        : `${column.key} = ?`;
      const values = column.name
        ? [key, key ? file.originalname : null, missionId]
        : [key, missionId];

      await pool.query(
        `UPDATE mission_info SET ${assignments} WHERE mission_id = ?`,
        values,
      );

      if (storedKeys[field]) {
        replaced.push({ field, key: storedKeys[field] });
      }
    }
  } catch (error) {
    console.error(error);
    // The database still points at the old objects, so only what this call
    // uploaded is orphaned.
    await Promise.all(
      uploaded.map(({ field, key }) =>
        storageService
          .removeMissionAsset(ASSET_COLUMNS[field].kind, key)
          .catch((cleanupError) =>
            console.error("Failed to remove orphan object", cleanupError),
          ),
      ),
    );

    if (error.status) {
      throw error;
    }
    const failure = new Error("Error updating mission");
    failure.status = 502;
    throw failure;
  }

  // Nothing points at these any more; a failure here only leaves dead bytes.
  await Promise.all(
    replaced.map(({ field, key }) =>
      storageService
        .removeMissionAsset(ASSET_COLUMNS[field].kind, key)
        .catch((error) =>
          console.error("Failed to remove replaced object", error),
        ),
    ),
  );

  return getMissionById(missionId);
};

/**
 * Removes the mission row (cascading to `mission_info`) and every object stored
 * under its prefix. The row goes first: a leftover object is cheap, a row
 * pointing at a deleted file is a broken mission card.
 */
const deleteMission = async (missionId) => {
  const [result] = await pool.query("DELETE FROM missions WHERE id = ?", [
    missionId,
  ]);

  if (!result.affectedRows) {
    const error = new Error("Mission not found");
    error.status = 404;
    throw error;
  }

  try {
    await storageService.removeMissionObjects(missionId);
  } catch (error) {
    console.error("Failed to remove mission objects", error);
  }
};

module.exports = {
  createNewMission,
  getMissions,
  getMissionById,
  updateMission,
  deleteMission,
};
