const services = require("../services/adminService");
const gameService = require("../services/gameService");
const { validateName } = require("../utils/name");
const { isValidNickname, isProfaneNickname } = require("../utils/nickname");
const { normalizePhone, PHONE_ERROR } = require("../utils/phone");
const { containsProfanity } = require("../utils/profanity");
const { parseGrade, parseLetter, GRADE_MIN, GRADE_MAX } = require("../utils/classes");
const { parseProfileInput } = require("../utils/profile");

const SCHOOL_NAME_MAX_LENGTH = 255;
const CITY_NAME_MAX_LENGTH = 100;

/**
 * Turns a thrown service error into a response. Services raise `status` for the
 * cases the panel has to tell apart (404 gone, 409 the write would destroy or
 * duplicate something) and `details` for the numbers behind a 409; anything
 * without a status is a bug and stays a 500.
 */
const fail = (res, error, fallback) => {
  console.error(error);
  if (error.status) {
    return res
      .status(error.status)
      .json({ message: error.message, details: error.details });
  }
  return res.status(500).json({ message: fallback });
};

/** Ids come from the path, so a non-numeric one is a bad request, not a 404. */
const readId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const handle = (loader, fallback) => async (req, res) => {
  try {
    res.json(await loader(req));
  } catch (error) {
    fail(res, error, fallback);
  }
};

const handleById = (loader, fallback) => async (req, res) => {
  const id = readId(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Invalid id" });
  }
  try {
    res.json(await loader(id, req));
  } catch (error) {
    fail(res, error, fallback);
  }
};

/* ─────────────────────────── Reads ─────────────────────────── */

const getTeachers = handle(services.getTeachers, "Error fetching teachers");
const getStudents = handle(services.getStudents, "Error fetching students");
const getClasses = handle(services.getClasses, "Error fetching classes");
const getSchools = handle(services.getSchools, "Error fetching schools");
const getEnrollments = handle(
  services.getEnrollments,
  "Error fetching enrollments",
);
const getCities = handle(services.getCities, "Error fetching cities");

const getTeacher = handleById(services.getTeacher, "Error fetching teacher");
const getClass = handleById(services.getClass, "Error fetching class");
const getSchool = handleById(services.getSchool, "Error fetching school");
const getCity = handleById(services.getCity, "Error fetching city");

/**
 * The student page carries their whole record: who they are, the classes they
 * are in, and how far they got. The progress half is the same report the
 * teacher-facing page reads, so it comes from `gameService` rather than a
 * second copy of those queries here.
 */
const getStudent = handleById(async (id) => {
  const student = await services.getStudent(id);
  const game = await gameService.getStudentReport(id);
  return { ...student, ...game };
}, "Error fetching student");

/* ─────────────────────────── Writes ─────────────────────────── */

/**
 * The editable half of an account.
 *
 * Teachers and students are validated by different rules on purpose: a teacher
 * signs up with a real name, a student picks a game nickname, and each endpoint
 * has to keep applying the rule its own registration flow applies. A student's
 * phone may be cleared — students register without one.
 */
const readUserPatch = (body, role) => {
  const patch = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (role === "teacher") {
      const error = validateName(name);
      if (error) {
        return { error };
      }
    } else {
      if (!isValidNickname(name)) {
        return { error: "Nickname must be 2-32 letters, digits or underscore" };
      }
      if (isProfaneNickname(name)) {
        return { error: "Nickname contains inappropriate language" };
      }
    }
    patch.name = name;
  }

  if (body.phone !== undefined) {
    const raw = body.phone === null ? "" : String(body.phone).trim();
    if (!raw) {
      if (role === "teacher") {
        return { error: "Phone is required" };
      }
      patch.phone = null;
    } else {
      const phone = normalizePhone(raw);
      if (!phone) {
        return { error: PHONE_ERROR };
      }
      patch.phone = phone;
    }
  }

  // Город и школа есть только у учителя — у ученика их не бывает, и присланные
  // поля здесь же и отсекаются, а не падают в сервисе.
  if (role === "teacher") {
    const profile = parseProfileInput(body);
    if (profile.error) {
      return { error: profile.error };
    }
    Object.assign(patch, profile.value);
  }

  return { patch };
};

const updateUserFor = (role) => async (req, res) => {
  const id = readId(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Invalid id" });
  }

  const { patch, error } = readUserPatch(req.body ?? {}, role);
  if (error) {
    return res.status(400).json({ message: error });
  }

  try {
    res.json(await services.updateUser(id, role, patch));
  } catch (caught) {
    fail(res, caught, "Error updating the account");
  }
};

/**
 * `?cascade=1` is the second, explicit ask: without it a teacher who still owns
 * classes is refused, with the counts of what deleting them would take down.
 */
const deleteUserFor = (role) => async (req, res) => {
  const id = readId(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Invalid id" });
  }

  const cascade = req.query.cascade === "1" || req.query.cascade === "true";

  try {
    res.json(await services.deleteUser(id, role, { cascade }));
  } catch (error) {
    fail(res, error, "Error deleting the account");
  }
};

const updateTeacher = updateUserFor("teacher");
const updateStudent = updateUserFor("student");
const deleteTeacher = deleteUserFor("teacher");
const deleteStudent = deleteUserFor("student");

const updateClass = async (req, res) => {
  const id = readId(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Invalid id" });
  }

  const body = req.body ?? {};
  const patch = {};

  if (body.grade !== undefined) {
    const grade = parseGrade(body.grade);
    if (!grade) {
      return res
        .status(400)
        .json({ message: `Grade must be between ${GRADE_MIN} and ${GRADE_MAX}` });
    }
    patch.grade = grade;
  }

  if (body.letter !== undefined) {
    // The alphabet is derived from the letter, never sent: «А» and "A" are
    // different classes, and the script is what tells them apart.
    const parsed = parseLetter(body.letter);
    if (!parsed) {
      return res
        .status(400)
        .json({ message: "Letter must be a single latin or cyrillic letter" });
    }
    patch.letter = parsed.letter;
    patch.alphabet = parsed.alphabet;
  }

  if (body.isActive !== undefined) {
    patch.isActive = Boolean(body.isActive);
  }

  if (body.schoolId !== undefined) {
    const schoolId = readId(body.schoolId);
    if (!schoolId) {
      return res.status(400).json({ message: "Invalid school" });
    }
    patch.schoolId = schoolId;
  }

  try {
    res.json(await services.updateClass(id, patch));
  } catch (error) {
    fail(res, error, "Error updating the class");
  }
};

const deleteClass = handleById(services.deleteClass, "Error deleting the class");

const updateSchool = async (req, res) => {
  const id = readId(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Invalid id" });
  }

  const patch = {};
  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name || name.length > SCHOOL_NAME_MAX_LENGTH) {
      return res.status(400).json({
        message: `School name must be 1-${SCHOOL_NAME_MAX_LENGTH} characters`,
      });
    }
    if (containsProfanity(name)) {
      return res
        .status(400)
        .json({ message: "School name contains inappropriate language" });
    }
    patch.name = name;
  }

  if (req.body?.cityId !== undefined) {
    const cityId = readId(req.body.cityId);
    if (!cityId) {
      return res.status(400).json({ message: "Invalid city" });
    }
    patch.cityId = cityId;
  }

  if (req.body?.isVerified !== undefined) {
    patch.isVerified = Boolean(req.body.isVerified);
  }

  try {
    res.json(await services.updateSchool(id, patch));
  } catch (error) {
    fail(res, error, "Error updating the school");
  }
};

/** Слияние дублей: `id` исчезает, всё его содержимое переезжает в `targetId`. */
const mergeSchool = async (req, res) => {
  const id = readId(req.params.id);
  const targetId = readId(req.body?.targetId);
  if (!id || !targetId) {
    return res.status(400).json({ message: "Invalid id" });
  }

  try {
    res.json(await services.mergeSchools(id, targetId));
  } catch (error) {
    fail(res, error, "Error merging the schools");
  }
};

const deleteSchool = handleById(
  services.deleteSchool,
  "Error deleting the school",
);

/**
 * Города заводит только админ, поэтому валидация имени живёт здесь и нигде
 * больше — свободного ввода города в приложении не осталось.
 */
const readCityPatch = (body, { requireName = false } = {}) => {
  const patch = {};

  if (body.nameRu !== undefined || requireName) {
    const nameRu = String(body.nameRu ?? "").trim();
    if (!nameRu || nameRu.length > CITY_NAME_MAX_LENGTH) {
      return {
        error: `City name must be 1-${CITY_NAME_MAX_LENGTH} characters`,
      };
    }
    if (containsProfanity(nameRu)) {
      return { error: "City name contains inappropriate language" };
    }
    patch.nameRu = nameRu;
  }

  for (const field of ["nameUz", "region"]) {
    if (body[field] !== undefined) {
      const value = body[field] === null ? "" : String(body[field]).trim();
      if (value.length > CITY_NAME_MAX_LENGTH) {
        return {
          error: `City name must be 1-${CITY_NAME_MAX_LENGTH} characters`,
        };
      }
      patch[field] = value;
    }
  }

  if (body.isActive !== undefined) {
    patch.isActive = Boolean(body.isActive);
  }

  return { patch };
};

const createCity = async (req, res) => {
  const { patch, error } = readCityPatch(req.body ?? {}, { requireName: true });
  if (error) {
    return res.status(400).json({ message: error });
  }

  try {
    res.status(201).json(await services.createCity(patch));
  } catch (caught) {
    fail(res, caught, "Error creating the city");
  }
};

const updateCity = async (req, res) => {
  const id = readId(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Invalid id" });
  }

  const { patch, error } = readCityPatch(req.body ?? {});
  if (error) {
    return res.status(400).json({ message: error });
  }

  try {
    res.json(await services.updateCity(id, patch));
  } catch (caught) {
    fail(res, caught, "Error updating the city");
  }
};

const deleteCity = handleById(services.deleteCity, "Error deleting the city");

const mergeCity = async (req, res) => {
  const id = readId(req.params.id);
  const targetId = readId(req.body?.targetId);
  if (!id || !targetId) {
    return res.status(400).json({ message: "Invalid id" });
  }

  try {
    res.json(await services.mergeCities(id, targetId));
  } catch (error) {
    fail(res, error, "Error merging the cities");
  }
};

const removeEnrollment = handleById(
  services.removeEnrollment,
  "Error removing the student from the class",
);

module.exports = {
  getTeachers,
  getTeacher,
  updateTeacher,
  deleteTeacher,
  getStudents,
  getStudent,
  updateStudent,
  deleteStudent,
  getClasses,
  getClass,
  updateClass,
  deleteClass,
  getSchools,
  getSchool,
  updateSchool,
  mergeSchool,
  deleteSchool,
  getCities,
  getCity,
  createCity,
  updateCity,
  deleteCity,
  mergeCity,
  getEnrollments,
  removeEnrollment,
};
