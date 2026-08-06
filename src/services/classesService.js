const pool = require("../config/db");
const schoolsService = require("./schoolsService");
const { generateInviteCode } = require("../utils/classes");

/** Random codes collide rarely; the unique index decides, we just try again. */
const CODE_ATTEMPTS = 5;

const CLASS_SELECT = `
  SELECT c.id,
         c.teacher_id,
         c.grade,
         c.letter,
         c.alphabet,
         c.join_code,
         c.is_active,
         c.created_at,
         s.id   AS school_id,
         s.name AS school_name,
         ci.id      AS city_id,
         ci.name_ru AS city_name,
         (SELECT COUNT(*)
            FROM class_students cs
           WHERE cs.class_id = c.id
             AND cs.status <> 'removed') AS students_count
    FROM classes c
    JOIN schools s ON s.id = c.school_id
    JOIN cities ci ON ci.id = s.city_id
`;

const isDuplicate = (error, indexName) =>
  error.code === "ER_DUP_ENTRY" && error.message.includes(indexName);

/**
 * `classes.join_code` holds the code that is live right now; `class_invite_codes`
 * keeps every code ever issued for the class, so a revoked one can be told apart
 * from a code that never existed.
 */
const recordInviteCode = async (connection, classId, code) => {
  await connection.query(
    "INSERT INTO class_invite_codes (class_id, code) VALUES (?, ?)",
    [classId, code],
  );
};

const createClass = async ({
  teacherId,
  cityId,
  schoolName,
  grade,
  letter,
  alphabet,
}) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const school = await schoolsService.getOrCreateSchool(
      cityId,
      schoolName,
      teacherId,
      connection,
    );

    let classId = null;
    let joinCode = null;

    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      const candidate = generateInviteCode();
      try {
        const [result] = await connection.query(
          `INSERT INTO classes (teacher_id, school_id, grade, letter, alphabet, join_code)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [teacherId, school.id, grade, letter, alphabet, candidate],
        );
        classId = result.insertId;
        joinCode = candidate;
        break;
      } catch (error) {
        if (isDuplicate(error, "uq_classes_join_code")) {
          continue;
        }
        if (isDuplicate(error, "uq_classes_unique")) {
          const conflict = new Error(
            "This class already exists in the selected school",
          );
          conflict.status = 409;
          throw conflict;
        }
        throw error;
      }
    }

    if (!classId) {
      throw new Error("Could not generate a unique invite code");
    }

    await recordInviteCode(connection, classId, joinCode);
    await connection.commit();

    return getClassById(classId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const getClassById = async (classId, executor = pool) => {
  const [rows] = await executor.query(`${CLASS_SELECT} WHERE c.id = ?`, [
    classId,
  ]);
  return rows[0] ?? null;
};

const getTeacherClasses = async (teacherId) => {
  const [rows] = await pool.query(
    `${CLASS_SELECT} WHERE c.teacher_id = ? ORDER BY c.grade, c.letter`,
    [teacherId],
  );
  return rows;
};

/** Ownership check for every teacher-facing operation on a single class. */
const getTeacherClass = async (teacherId, classId) => {
  const found = await getClassById(classId);
  if (!found || found.teacher_id !== teacherId) {
    const error = new Error("Class not found");
    error.status = 404;
    throw error;
  }
  return found;
};

/**
 * Issues a new code and revokes the previous ones.
 *
 * Students are linked to the class through `class_students.class_id`, never
 * through the code itself, so everyone who already joined stays in the class —
 * only the code that lets *new* students in changes.
 */
const rotateInviteCode = async (teacherId, classId) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Locks the row for the length of the transaction, so two parallel
    // rotations cannot both write a "current" code.
    const [owned] = await connection.query(
      "SELECT id, teacher_id FROM classes WHERE id = ? FOR UPDATE",
      [classId],
    );
    if (!owned.length || owned[0].teacher_id !== teacherId) {
      const error = new Error("Class not found");
      error.status = 404;
      throw error;
    }

    await connection.query(
      `UPDATE class_invite_codes
          SET revoked_at = NOW()
        WHERE class_id = ? AND revoked_at IS NULL`,
      [classId],
    );

    let joinCode = null;
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      const candidate = generateInviteCode();
      try {
        await connection.query(
          "UPDATE classes SET join_code = ? WHERE id = ?",
          [candidate, classId],
        );
        await recordInviteCode(connection, classId, candidate);
        joinCode = candidate;
        break;
      } catch (error) {
        if (
          isDuplicate(error, "uq_classes_join_code") ||
          isDuplicate(error, "uq_invite_code")
        ) {
          continue;
        }
        throw error;
      }
    }

    if (!joinCode) {
      throw new Error("Could not generate a unique invite code");
    }

    const updated = await getClassById(classId, connection);
    await connection.commit();

    return updated;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/** Codes are looked up in the history table: a revoked one must not let anyone in. */
const findClassByInviteCode = async (code) => {
  const [rows] = await pool.query(
    `${CLASS_SELECT}
      JOIN class_invite_codes ic ON ic.class_id = c.id
     WHERE ic.code = ?
       AND ic.revoked_at IS NULL
       AND (ic.expires_at IS NULL OR ic.expires_at > NOW())
       AND c.is_active = 1`,
    [code],
  );
  return rows[0] ?? null;
};

const joinClassByInviteCode = async (studentId, code) => {
  const found = await findClassByInviteCode(code);
  if (!found) {
    const error = new Error("Invite code not found");
    error.status = 404;
    throw error;
  }

  // Re-entering after being removed puts the student back into the class
  // instead of failing on the unique index.
  await pool.query(
    `INSERT INTO class_students (class_id, student_id, status)
     VALUES (?, ?, 'active')
     ON DUPLICATE KEY UPDATE status = 'active'`,
    [found.id, studentId],
  );

  return found;
};

const getClassStudents = async (classId) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.phone, cs.status, cs.joined_at
       FROM class_students cs
       JOIN users u ON u.id = cs.student_id
      WHERE cs.class_id = ?
        AND cs.status <> 'removed'
      ORDER BY u.name`,
    [classId],
  );
  return rows;
};

module.exports = {
  createClass,
  getClassById,
  getTeacherClasses,
  getTeacherClass,
  rotateInviteCode,
  findClassByInviteCode,
  joinClassByInviteCode,
  getClassStudents,
};
