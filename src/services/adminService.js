const pool = require("../config/db");
const profileService = require("./profileService");
const {
  normalizeCityName,
  normalizeSchoolName,
} = require("../utils/dictionaries");

/**
 * The academy-wide directory: the rows behind every dashboard counter, the
 * record behind every row, and the edits an admin may make to them.
 *
 * Two rules run through the whole file.
 *
 * Counting matches `statsService.getOverview` exactly — teachers and students
 * by granted role, memberships excluding `removed`. A number on the home page
 * that does not match the length of the list it opens reads as a bug even when
 * both are defensible.
 *
 * Nobody is addressed by id alone: every single-record read and every write
 * checks that the account actually holds the role the endpoint is about, so
 * `/admin/students/7` can never be used to rewrite a teacher — or an admin.
 */

/**
 * The cities a person is *present* in, reached through their classes — someone
 * can teach or study across several towns, so these are concatenated instead of
 * picked from arbitrarily.
 *
 * A teacher additionally has a city of their own now (`users.city_id`, the one
 * on their profile); the two answer different questions and both are returned.
 */
const CITY_LIST = `GROUP_CONCAT(DISTINCT ci.name_ru ORDER BY ci.name_ru SEPARATOR ', ')`;

const ROLE_LIST = `(SELECT GROUP_CONCAT(r2.name ORDER BY r2.name)
                      FROM user_roles ur2
                      JOIN roles r2 ON r2.id = ur2.role_id
                     WHERE ur2.user_id = u.id)`;

/* ─────────────────────────── Teachers ─────────────────────────── */

/**
 * `students_count` counts distinct students, not memberships: a teacher running
 * two classes the same student joined teaches one student, not two.
 *
 * Aggregates wrap the joined columns rather than growing the GROUP BY — under
 * ONLY_FULL_GROUP_BY, functional dependency is detected through the primary key
 * of `users`, but not through the LEFT JOINed tables.
 */
const teacherRows = async (filter = "", params = []) => {
  const [rows] = await pool.query(
    `SELECT u.id,
            u.name,
            u.phone,
            u.created_at,
            ${ROLE_LIST} AS roles,
            ${CITY_LIST} AS cities,
            u.city_id,
            MAX(own_ci.name_ru) AS city_name,
            u.school_id,
            MAX(own_s.name) AS school_name,
            COUNT(DISTINCT c.id) AS classes_count,
            COUNT(DISTINCT CASE WHEN cs.status <> 'removed'
                                THEN cs.student_id END) AS students_count
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id AND r.name = 'teacher'
       LEFT JOIN cities  own_ci ON own_ci.id = u.city_id
       LEFT JOIN schools own_s  ON own_s.id = u.school_id
       LEFT JOIN classes c ON c.teacher_id = u.id
       LEFT JOIN schools s ON s.id = c.school_id
       LEFT JOIN cities ci ON ci.id = s.city_id
       LEFT JOIN class_students cs ON cs.class_id = c.id
      WHERE 1 = 1 ${filter}
      GROUP BY u.id
      ORDER BY students_count DESC, u.name ASC`,
    params,
  );
  return rows;
};

const getTeachers = () => teacherRows();

/** The teacher's record plus the classes they run — the drill-down of one row. */
const getTeacher = async (teacherId) => {
  const [teacher] = await teacherRows("AND u.id = ?", [teacherId]);
  if (!teacher) {
    throw notFound("Teacher not found");
  }

  const classes = await classRows("AND c.teacher_id = ?", [teacherId]);
  return { ...teacher, classes };
};

/* ─────────────────────────── Students ─────────────────────────── */

/**
 * Every account with the student role, including the ones that never entered a
 * class code — those are exactly the difference between the "students" tile and
 * "in classes", and hiding them would make the two impossible to reconcile.
 * The game profile is LEFT JOINed for the same reason a class roster joins it:
 * a student who never opened the game has no row there yet.
 */
const studentRows = async (filter = "", params = []) => {
  const [rows] = await pool.query(
    `SELECT u.id,
            u.name,
            u.phone,
            u.created_at,
            ${ROLE_LIST} AS roles,
            ${CITY_LIST} AS cities,
            GROUP_CONCAT(DISTINCT CONCAT(c.grade, c.letter)
                         ORDER BY c.grade, c.letter SEPARATOR ', ') AS class_labels,
            COUNT(DISTINCT c.id) AS classes_count,
            COALESCE(MAX(gp.stars), 0) AS stars,
            COALESCE(MAX(gp.score), 0) AS score,
            COALESCE(MAX(gp.total), 0) AS total
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id AND r.name = 'student'
       LEFT JOIN class_students cs
              ON cs.student_id = u.id AND cs.status <> 'removed'
       LEFT JOIN classes c ON c.id = cs.class_id
       LEFT JOIN schools s ON s.id = c.school_id
       LEFT JOIN cities ci ON ci.id = s.city_id
       LEFT JOIN game_profiles gp ON gp.user_id = u.id
      WHERE 1 = 1 ${filter}
      GROUP BY u.id
      ORDER BY total DESC, u.name ASC`,
    params,
  );
  return rows;
};

const getStudents = () => studentRows();

/**
 * The student's record and the classes they are in. Their mission and test
 * progress is not read here — `gameService.getStudentReport` already answers
 * that for the teacher-facing page, and the controller composes the two.
 */
const getStudent = async (studentId) => {
  const [student] = await studentRows("AND u.id = ?", [studentId]);
  if (!student) {
    throw notFound("Student not found");
  }

  const memberships = await enrollmentRows("AND cs.student_id = ?", [studentId]);
  return { ...student, memberships };
};

/* ──────────────────────────── Classes ──────────────────────────── */

/**
 * Every class of every teacher, which is what separates this from
 * `classesService.getTeacherClasses`. The teacher is LEFT JOINed so a class
 * whose owner account is gone still shows up and stays countable.
 */
const classRows = async (filter = "", params = []) => {
  const [rows] = await pool.query(
    `SELECT c.id,
            c.grade,
            c.letter,
            c.alphabet,
            c.is_active,
            c.join_code,
            c.created_at,
            s.id   AS school_id,
            s.name AS school_name,
            ci.id      AS city_id,
            ci.name_ru AS city_name,
            c.teacher_id,
            t.name  AS teacher_name,
            t.phone AS teacher_phone,
            (SELECT COUNT(*)
               FROM class_students cs
              WHERE cs.class_id = c.id
                AND cs.status <> 'removed') AS students_count
       FROM classes c
       JOIN schools s ON s.id = c.school_id
       JOIN cities ci ON ci.id = s.city_id
       LEFT JOIN users t ON t.id = c.teacher_id
      WHERE 1 = 1 ${filter}
      ORDER BY ci.name_ru, s.name, c.grade, c.letter`,
    params,
  );
  return rows;
};

const getClasses = () => classRows();

/** The class plus its roster, in leaderboard order like the teacher's view. */
const getClass = async (classId) => {
  const [found] = await classRows("AND c.id = ?", [classId]);
  if (!found) {
    throw notFound("Class not found");
  }

  const [students] = await pool.query(
    `SELECT u.id,
            u.name,
            u.phone,
            cs.id AS enrollment_id,
            cs.status,
            cs.joined_at,
            COALESCE(gp.stars, 0) AS stars,
            COALESCE(gp.score, 0) AS score,
            COALESCE(gp.total, 0) AS total
       FROM class_students cs
       JOIN users u ON u.id = cs.student_id
       LEFT JOIN game_profiles gp ON gp.user_id = u.id
      WHERE cs.class_id = ?
        AND cs.status <> 'removed'
      ORDER BY total DESC, u.name ASC`,
    [classId],
  );

  return { ...found, students };
};

/* ──────────────────────────── Schools ──────────────────────────── */

/**
 * A school with no classes is not an error: teachers pick their school when they
 * register, long before the first class exists, and a school whose classes were
 * all removed still counts towards the tile.
 *
 * `teachers_count` counts through the classes, not through `users.school_id` —
 * it answers "who actually teaches here", which is what the row is about.
 */
const schoolRows = async (filter = "", params = []) => {
  const [rows] = await pool.query(
    `SELECT s.id,
            s.name,
            s.created_at,
            s.is_verified,
            ci.id      AS city_id,
            ci.name_ru AS city_name,
            COUNT(DISTINCT c.id) AS classes_count,
            COUNT(DISTINCT c.teacher_id) AS teachers_count,
            COUNT(DISTINCT CASE WHEN cs.status <> 'removed'
                                THEN cs.student_id END) AS students_count
       FROM schools s
       JOIN cities ci ON ci.id = s.city_id
       LEFT JOIN classes c ON c.school_id = s.id
       LEFT JOIN class_students cs ON cs.class_id = c.id
      WHERE 1 = 1 ${filter}
      GROUP BY s.id
      ORDER BY students_count DESC, ci.name_ru, s.name`,
    params,
  );
  return rows;
};

const getSchools = () => schoolRows();

const getSchool = async (schoolId) => {
  const [school] = await schoolRows("AND s.id = ?", [schoolId]);
  if (!school) {
    throw notFound("School not found");
  }

  const classes = await classRows("AND c.school_id = ?", [schoolId]);
  return { ...school, classes };
};

/* ────────────────────────── Enrollments ────────────────────────── */

/**
 * One row per live membership, so a student who joined two classes appears
 * twice — that is what the "in classes" counter counts.
 */
const enrollmentRows = async (filter = "", params = []) => {
  const [rows] = await pool.query(
    `SELECT cs.id,
            cs.status,
            cs.joined_at,
            u.id    AS student_id,
            u.name  AS student_name,
            u.phone AS student_phone,
            c.id     AS class_id,
            c.grade,
            c.letter,
            c.alphabet,
            s.id   AS school_id,
            s.name AS school_name,
            ci.name_ru AS city_name,
            c.teacher_id,
            t.name AS teacher_name,
            COALESCE(gp.total, 0) AS total
       FROM class_students cs
       JOIN users u ON u.id = cs.student_id
       JOIN classes c ON c.id = cs.class_id
       JOIN schools s ON s.id = c.school_id
       JOIN cities ci ON ci.id = s.city_id
       LEFT JOIN users t ON t.id = c.teacher_id
       LEFT JOIN game_profiles gp ON gp.user_id = u.id
      WHERE cs.status <> 'removed' ${filter}
      ORDER BY cs.joined_at DESC, u.name ASC`,
    params,
  );
  return rows;
};

const getEnrollments = () => enrollmentRows();

/* ─────────────────────────── Writes ─────────────────────────── */

const httpError = (status, message, details) => {
  const error = new Error(message);
  error.status = status;
  if (details) {
    error.details = details;
  }
  return error;
};

const notFound = (message) => httpError(404, message);

const isDuplicate = (error, indexName) =>
  error.code === "ER_DUP_ENTRY" && error.message.includes(indexName);

/**
 * Resolves the target of a write and refuses the ones that must not happen.
 *
 * The role check is what keeps the endpoints honest: `/admin/teachers/:id` and
 * `/admin/students/:id` address the same table, and without it either could be
 * pointed at any account at all. Accounts holding the admin role are off limits
 * for both — an admin panel that can delete its own admins locks everyone out,
 * and the deletion cascades through every table keyed by user id.
 */
const requireUser = async (userId, role) => {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.phone, ${ROLE_LIST} AS roles
       FROM users u
      WHERE u.id = ?`,
    [userId],
  );

  const user = rows[0];
  const roles = user?.roles ? user.roles.split(",") : [];

  if (!user || !roles.includes(role)) {
    throw notFound(role === "teacher" ? "Teacher not found" : "Student not found");
  }
  if (roles.includes("admin")) {
    throw httpError(403, "Admin accounts cannot be changed from the directory");
  }

  return { ...user, roles };
};

/**
 * Renames an account, changes its phone, and — for a teacher — fixes the city
 * and the school on their profile.
 *
 * `users.name` is the login handle and is unique, so a rename can collide with
 * a live account — the unique index decides that, not a lookup that another
 * request could invalidate a moment later.
 *
 * The profile pair goes through the same resolver the teacher's own form uses,
 * so the rules hold wherever the write came from: the school must belong to the
 * city, and changing the city drops a school that stayed behind in the old one.
 */
const updateUser = async (userId, role, { name, phone, cityId, schoolId, schoolName }) => {
  await requireUser(userId, role);

  const fields = [];
  const params = [];

  if (name !== undefined) {
    fields.push("name = ?");
    params.push(name);
  }
  if (phone !== undefined) {
    fields.push("phone = ?");
    params.push(phone);
  }

  const touchesProfile =
    cityId !== undefined || schoolId !== undefined || schoolName !== undefined;

  if (touchesProfile) {
    if (role !== "teacher") {
      throw httpError(400, "Only a teacher has a city and a school");
    }

    const current = await profileService.getProfile(userId);
    const resolved = await profileService.resolveCityAndSchool(
      { cityId, schoolId, schoolName },
      { current, userId },
    );
    fields.push("city_id = ?", "school_id = ?");
    params.push(resolved.cityId, resolved.schoolId);
  }

  if (fields.length) {
    try {
      await pool.query(
        `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
        [...params, userId],
      );
    } catch (error) {
      if (isDuplicate(error, "uq_users_name")) {
        throw httpError(409, "This name is already taken");
      }
      throw error;
    }
  }

  return role === "teacher" ? getTeacher(userId) : getStudent(userId);
};

/**
 * Deletes the account for good.
 *
 * `classes.teacher_id` is ON DELETE CASCADE, so removing a teacher also removes
 * every class they own, its invite codes and its roster — the students survive,
 * but they land outside any class. That is far more than "delete this account"
 * looks like, so it only happens when the caller asked for it explicitly; the
 * refusal carries the counts so the panel can say what is at stake.
 */
const deleteUser = async (userId, role, { cascade = false } = {}) => {
  await requireUser(userId, role);

  const [[owned]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM classes WHERE teacher_id = ?) AS classes,
            (SELECT COUNT(*)
               FROM class_students cs
               JOIN classes c ON c.id = cs.class_id
              WHERE c.teacher_id = ?
                AND cs.status <> 'removed')                  AS students`,
    [userId, userId],
  );

  if (owned.classes > 0 && !cascade) {
    throw httpError(409, "The teacher still owns classes", {
      classes: owned.classes,
      students: owned.students,
    });
  }

  await pool.query("DELETE FROM users WHERE id = ?", [userId]);

  return { id: userId, deletedClasses: owned.classes };
};

/**
 * Grade, letter, archive flag — and the school the class belongs to.
 *
 * Moving a class is what fixes the mistake nobody else can: a teacher who
 * registered under the wrong school, or two schools that turned out to be one
 * building. The class keeps its code and its whole roster — students are tied
 * to `class_id`, not to the school — but the class does change city with it,
 * which is why it is an admin operation and not a teacher one.
 */
const updateClass = async (classId, { grade, letter, alphabet, isActive, schoolId }) => {
  const [found] = await classRows("AND c.id = ?", [classId]);
  if (!found) {
    throw notFound("Class not found");
  }

  const fields = [];
  const params = [];

  if (schoolId !== undefined && schoolId !== found.school_id) {
    const [target] = await schoolRows("AND s.id = ?", [schoolId]);
    if (!target) {
      throw httpError(400, "School not found");
    }
    fields.push("school_id = ?");
    params.push(schoolId);
  }

  if (grade !== undefined) {
    fields.push("grade = ?");
    params.push(grade);
  }
  if (letter !== undefined) {
    fields.push("letter = ?", "alphabet = ?");
    params.push(letter, alphabet);
  }
  if (isActive !== undefined) {
    fields.push("is_active = ?");
    params.push(isActive ? 1 : 0);
  }

  if (fields.length) {
    try {
      await pool.query(
        `UPDATE classes SET ${fields.join(", ")} WHERE id = ?`,
        [...params, classId],
      );
    } catch (error) {
      if (isDuplicate(error, "uq_classes_unique")) {
        throw httpError(409, "This class already exists in the selected school");
      }
      throw error;
    }
  }

  return getClass(classId);
};

/**
 * Deletes the class. `class_students` and `class_invite_codes` cascade, so the
 * students stay — with everything they earned — and simply belong to no class
 * until they enter another code.
 */
const deleteClass = async (classId) => {
  const [result] = await pool.query("DELETE FROM classes WHERE id = ?", [
    classId,
  ]);
  if (!result.affectedRows) {
    throw notFound("Class not found");
  }
  return { id: classId };
};

/**
 * Renames a school, moves it to another city, and confirms it.
 *
 * `name_normalized` is what the unique index and the get-or-create lookup go
 * through, so it is rewritten together with the name — otherwise the next
 * teacher typing this school would create a second row for it.
 *
 * The city is editable now, unlike before: a school in the wrong city is the
 * one mistake a teacher cannot undo themselves, and «перезаведите её заново»
 * would strand the classes that already hang off this row.
 */
const updateSchool = async (schoolId, { name, cityId, isVerified }) => {
  const [found] = await schoolRows("AND s.id = ?", [schoolId]);
  if (!found) {
    throw notFound("School not found");
  }

  const fields = [];
  const params = [];

  if (name !== undefined) {
    fields.push("name = ?", "name_normalized = ?");
    params.push(name, normalizeSchoolName(name));
  }
  if (cityId !== undefined && cityId !== found.city_id) {
    const [[city]] = await pool.query("SELECT id FROM cities WHERE id = ?", [
      cityId,
    ]);
    if (!city) {
      throw httpError(400, "City not found");
    }
    fields.push("city_id = ?");
    params.push(cityId);
  }
  if (isVerified !== undefined) {
    fields.push("is_verified = ?");
    params.push(isVerified ? 1 : 0);
  }

  if (fields.length) {
    try {
      await pool.query(
        `UPDATE schools SET ${fields.join(", ")} WHERE id = ?`,
        [...params, schoolId],
      );
    } catch (error) {
      if (isDuplicate(error, "uq_schools_city_name")) {
        // Столкновение с существующей строкой — это и есть дубль, который надо
        // не переименовывать, а объединять; так и отвечаем.
        throw httpError(
          409,
          "This city already has a school with that name — merge them instead",
        );
      }
      throw error;
    }
  }

  return getSchool(schoolId);
};

/**
 * Сливает школу-дубль в другую школу.
 *
 * Переносит классы и профили учителей, затем удаляет исходную строку. Ученики
 * не участвуют вовсе: они привязаны к классу, а класс переезжает целиком.
 *
 * Классы переносятся по одному, и столкновение с уже существующим в целевой
 * школе классом (те же цифра и буква) не проглатывается: слияние откатывается
 * и возвращает список конфликтов, чтобы админ сначала разобрался с ними —
 * молча удалить чужой класс с его учениками не вправе никто.
 */
const mergeSchools = async (sourceId, targetId) => {
  if (sourceId === targetId) {
    throw httpError(400, "A school cannot be merged into itself");
  }

  const [source] = await schoolRows("AND s.id = ?", [sourceId]);
  if (!source) {
    throw notFound("School not found");
  }
  const [target] = await schoolRows("AND s.id = ?", [targetId]);
  if (!target) {
    throw notFound("Target school not found");
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [classes] = await connection.query(
      "SELECT id, grade, letter FROM classes WHERE school_id = ?",
      [sourceId],
    );

    const conflicts = [];
    for (const item of classes) {
      try {
        await connection.query("UPDATE classes SET school_id = ? WHERE id = ?", [
          targetId,
          item.id,
        ]);
      } catch (error) {
        if (isDuplicate(error, "uq_classes_unique")) {
          conflicts.push(`${item.grade}${item.letter}`);
          continue;
        }
        throw error;
      }
    }

    if (conflicts.length) {
      throw httpError(409, "The target school already has these classes", {
        classes: conflicts.length,
        conflicts,
      });
    }

    await connection.query(
      "UPDATE users SET school_id = ? WHERE school_id = ?",
      [targetId, sourceId],
    );
    await connection.query("DELETE FROM schools WHERE id = ?", [sourceId]);

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return getSchool(targetId);
};

/**
 * Deletes an empty school. `classes.school_id` is ON DELETE NO ACTION, so the
 * database would refuse this anyway — the check is here to answer with the
 * count instead of a foreign key error.
 */
const deleteSchool = async (schoolId) => {
  const [found] = await schoolRows("AND s.id = ?", [schoolId]);
  if (!found) {
    throw notFound("School not found");
  }
  if (found.classes_count > 0) {
    throw httpError(409, "The school still has classes", {
      classes: found.classes_count,
    });
  }

  // `users.school_id` — ON DELETE SET NULL, поэтому учителя этой школы просто
  // окажутся без школы в профиле и выберут её заново.
  await pool.query("DELETE FROM schools WHERE id = ?", [schoolId]);
  return { id: schoolId };
};

/* ──────────────────────────── Cities ──────────────────────────── */

/**
 * Справочник городов со всем, что на нём висит.
 *
 * `teachers_count` считается по профилям (`users.city_id`), а не по классам:
 * город теперь принадлежит учителю, и именно эти аккаунты осиротеют, если
 * город удалить. `students_count` — наоборот, через классы: у ученика своего
 * города нет, он там, где его класс.
 */
const cityRows = async (filter = "", params = []) => {
  const [rows] = await pool.query(
    `SELECT ci.id,
            ci.name_ru,
            ci.name_uz,
            ci.region,
            ci.is_active,
            COUNT(DISTINCT s.id) AS schools_count,
            COUNT(DISTINCT c.id) AS classes_count,
            COUNT(DISTINCT CASE WHEN tr.id IS NOT NULL THEN tu.id END) AS teachers_count,
            COUNT(DISTINCT CASE WHEN cs.status <> 'removed'
                                THEN cs.student_id END) AS students_count
       FROM cities ci
       LEFT JOIN schools s ON s.city_id = ci.id
       LEFT JOIN classes c ON c.school_id = s.id
       LEFT JOIN class_students cs ON cs.class_id = c.id
       LEFT JOIN users tu ON tu.city_id = ci.id
       LEFT JOIN user_roles tur ON tur.user_id = tu.id
       LEFT JOIN roles tr ON tr.id = tur.role_id AND tr.name = 'teacher'
      WHERE 1 = 1 ${filter}
      GROUP BY ci.id
      ORDER BY ci.name_ru`,
    params,
  );
  return rows;
};

const getCities = () => cityRows();

/** Город и его школы — то, из чего состоит разбор дублей. */
const getCity = async (cityId) => {
  const [city] = await cityRows("AND ci.id = ?", [cityId]);
  if (!city) {
    throw notFound("City not found");
  }

  const schools = await schoolRows("AND s.city_id = ?", [cityId]);
  return { ...city, schools };
};

const cityFields = ({ nameRu, nameUz, region, isActive }) => {
  const fields = [];
  const params = [];

  if (nameRu !== undefined) {
    fields.push("name_ru = ?", "name_normalized = ?");
    params.push(nameRu, normalizeCityName(nameRu));
  }
  if (nameUz !== undefined) {
    fields.push("name_uz = ?");
    params.push(nameUz || null);
  }
  if (region !== undefined) {
    fields.push("region = ?");
    params.push(region || null);
  }
  if (isActive !== undefined) {
    fields.push("is_active = ?");
    params.push(isActive ? 1 : 0);
  }

  return { fields, params };
};

const duplicateCity = (error) =>
  isDuplicate(error, "uq_cities_normalized") ||
  isDuplicate(error, "name_ru") ||
  isDuplicate(error, "uq_cities_name");

const createCity = async ({ nameRu, nameUz, region, isActive = true }) => {
  try {
    const [result] = await pool.query(
      `INSERT INTO cities (name_ru, name_uz, region, name_normalized, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [
        nameRu,
        nameUz || null,
        region || null,
        normalizeCityName(nameRu),
        isActive ? 1 : 0,
      ],
    );
    return getCity(result.insertId);
  } catch (error) {
    if (duplicateCity(error)) {
      throw httpError(409, "This city is already in the directory");
    }
    throw error;
  }
};

/**
 * Деактивация (`isActive = false`) — мягкая альтернатива удалению: город
 * исчезает из выбора при регистрации, но всё, что к нему привязано, остаётся
 * на месте.
 */
const updateCity = async (cityId, patch) => {
  const [found] = await cityRows("AND ci.id = ?", [cityId]);
  if (!found) {
    throw notFound("City not found");
  }

  const { fields, params } = cityFields(patch);
  if (fields.length) {
    try {
      await pool.query(
        `UPDATE cities SET ${fields.join(", ")} WHERE id = ?`,
        [...params, cityId],
      );
    } catch (error) {
      if (duplicateCity(error)) {
        throw httpError(
          409,
          "This city is already in the directory — merge them instead",
        );
      }
      throw error;
    }
  }

  return getCity(cityId);
};

/**
 * Удаляет пустой город. Город со школами не удаляется: его либо сливают с
 * настоящим, либо деактивируют — «удалить вместе со школами» унесло бы с собой
 * классы и учителей, которые к самому городу отношения не имеют.
 */
const deleteCity = async (cityId) => {
  const [found] = await cityRows("AND ci.id = ?", [cityId]);
  if (!found) {
    throw notFound("City not found");
  }
  if (found.schools_count > 0 || found.teachers_count > 0) {
    throw httpError(409, "The city still has schools or teachers", {
      schools: found.schools_count,
      teachers: found.teachers_count,
    });
  }

  await pool.query("DELETE FROM cities WHERE id = ?", [cityId]);
  return { id: cityId };
};

/**
 * Сливает город-дубль в настоящий.
 *
 * Школы переезжают в целевой город; та из них, для которой там уже есть школа с
 * тем же нормализованным именем, не переезжает, а сливается с ней — иначе
 * перенос упёрся бы в уникальный индекс ровно на тех строках, ради которых
 * слияние и затевалось.
 *
 * Одной транзакции на всё нет: слияние школ открывает собственную. Поэтому
 * конфликт классов внутри пары школ обрывает слияние города на середине — часть
 * школ уже переехала. Это не тупик: город удаляется последним, так что он всё
 * ещё на месте, а повторный запуск после разбора конфликта доводит дело до
 * конца — операция идемпотентна по построению.
 */
const mergeCities = async (sourceId, targetId) => {
  if (sourceId === targetId) {
    throw httpError(400, "A city cannot be merged into itself");
  }

  const [source] = await cityRows("AND ci.id = ?", [sourceId]);
  if (!source) {
    throw notFound("City not found");
  }
  const [target] = await cityRows("AND ci.id = ?", [targetId]);
  if (!target) {
    throw notFound("Target city not found");
  }

  const [[sourceSchools], [targetSchools]] = await Promise.all([
    pool.query(
      "SELECT id, name_normalized FROM schools WHERE city_id = ?",
      [sourceId],
    ),
    pool.query(
      "SELECT id, name_normalized FROM schools WHERE city_id = ?",
      [targetId],
    ),
  ]);

  const byName = new Map(
    targetSchools.map((school) => [school.name_normalized, school.id]),
  );

  for (const school of sourceSchools) {
    const twin = byName.get(school.name_normalized);
    if (twin) {
      await mergeSchools(school.id, twin);
      continue;
    }
    await pool.query("UPDATE schools SET city_id = ? WHERE id = ?", [
      targetId,
      school.id,
    ]);
  }

  await pool.query("UPDATE users SET city_id = ? WHERE city_id = ?", [
    targetId,
    sourceId,
  ]);
  await pool.query("DELETE FROM cities WHERE id = ?", [sourceId]);

  return getCity(targetId);
};

/**
 * Takes the student out of the class by membership id — the same soft removal
 * the teacher-facing endpoint performs: the row is marked `removed`, everything
 * the student earned lives on, and entering a code puts them back.
 */
const removeEnrollment = async (enrollmentId) => {
  const [result] = await pool.query(
    `UPDATE class_students
        SET status = 'removed'
      WHERE id = ?
        AND status <> 'removed'`,
    [enrollmentId],
  );

  if (!result.affectedRows) {
    throw notFound("Enrollment not found");
  }
  return { id: enrollmentId, status: "removed" };
};

module.exports = {
  getTeachers,
  getTeacher,
  getStudents,
  getStudent,
  getClasses,
  getClass,
  getSchools,
  getSchool,
  getEnrollments,
  updateUser,
  deleteUser,
  updateClass,
  deleteClass,
  updateSchool,
  mergeSchools,
  deleteSchool,
  getCities,
  getCity,
  createCity,
  updateCity,
  deleteCity,
  mergeCities,
  removeEnrollment,
};
