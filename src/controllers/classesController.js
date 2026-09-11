const services = require("../services/classesService");
const gameService = require("../services/gameService");
const {
  GRADE_MIN,
  GRADE_MAX,
  normalizeInviteCode,
  isValidInviteCode,
  parseGrade,
  parseLetter,
} = require("../utils/classes");

const getMyClasses = async (req, res) => {
  try {
    const result = await services.getTeacherClasses(req.user.id);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching classes" });
  }
};

/**
 * Класс — это «класс + буква». Город и школа берутся из профиля учителя;
 * `schoolId` в теле нужен только для класса в другой школе.
 */
const createClass = async (req, res) => {
  try {
    const { schoolId, grade, letter } = req.body;

    let targetSchoolId;
    if (schoolId !== undefined && schoolId !== null && schoolId !== "") {
      targetSchoolId = Number(schoolId);
      if (!Number.isInteger(targetSchoolId) || targetSchoolId <= 0) {
        return res.status(400).json({ message: "Invalid school" });
      }
    }

    const parsedGrade = parseGrade(grade);
    if (!parsedGrade) {
      return res
        .status(400)
        .json({ message: `Grade must be between ${GRADE_MIN} and ${GRADE_MAX}` });
    }

    const parsedLetter = parseLetter(letter);
    if (!parsedLetter) {
      return res
        .status(400)
        .json({ message: "Letter must be a single latin or cyrillic letter" });
    }

    const result = await services.createClass({
      teacherId: req.user.id,
      schoolId: targetSchoolId,
      grade: parsedGrade,
      letter: parsedLetter.letter,
      alphabet: parsedLetter.alphabet,
    });

    res.status(201).json(result);
  } catch (error) {
    console.error(error);
    if (error.status) {
      // `PROFILE_INCOMPLETE` — это не «неверные данные», а «профиль не заполнен»:
      // приложение по этому коду открывает выбор города и школы, а не подсвечивает поле.
      return res
        .status(error.status)
        .json({ message: error.message, code: error.code });
    }
    res.status(500).json({ message: "Error creating class" });
  }
};

const getClass = async (req, res) => {
  try {
    const result = await services.getTeacherClass(
      req.user.id,
      Number(req.params.id),
    );
    res.json(result);
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    res.status(500).json({ message: "Error fetching class" });
  }
};

/**
 * Issues a new invite code. Students already in the class keep their place —
 * they are tied to the class, not to the code.
 */
const rotateCode = async (req, res) => {
  try {
    const result = await services.rotateInviteCode(
      req.user.id,
      Number(req.params.id),
    );
    res.json(result);
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    res.status(500).json({ message: "Error updating invite code" });
  }
};

const getStudents = async (req, res) => {
  try {
    const classId = Number(req.params.id);
    await services.getTeacherClass(req.user.id, classId);
    const result = await services.getClassStudents(classId);
    res.json(result);
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    res.status(500).json({ message: "Error fetching class students" });
  }
};

/**
 * Everything the teacher can see about one student: their standing in the class
 * plus the full game record. The class ownership check comes first, and the
 * student is read through `class_students`, so a teacher can only ever open a
 * student who is in a class of theirs.
 */
const getStudent = async (req, res) => {
  try {
    const classId = Number(req.params.id);
    const studentId = Number(req.params.studentId);
    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({ message: "Invalid student id" });
    }

    await services.getTeacherClass(req.user.id, classId);
    const student = await services.getClassStudent(classId, studentId);
    const game = await gameService.getStudentReport(studentId);

    res.json({ ...student, ...game });
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    res.status(500).json({ message: "Error fetching student" });
  }
};

/**
 * Removes the student from the class — for the one who entered the wrong code,
 * or who moved on to another class. Their progress is untouched; they are just
 * no longer in this class, and can join another one with its code.
 */
const removeStudent = async (req, res) => {
  try {
    const classId = Number(req.params.id);
    const studentId = Number(req.params.studentId);
    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({ message: "Invalid student id" });
    }

    await services.getTeacherClass(req.user.id, classId);
    await services.removeStudentFromClass(classId, studentId);

    res.json({ id: studentId, status: "removed" });
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    res.status(500).json({ message: "Error removing the student" });
  }
};

/** Lets a student check a code before committing to it. */
const lookupByCode = async (req, res) => {
  try {
    const code = normalizeInviteCode(req.params.code);
    if (!isValidInviteCode(code)) {
      return res.status(400).json({ message: "Invalid invite code" });
    }

    const found = await services.findClassByInviteCode(code);
    if (!found) {
      return res.status(404).json({ message: "Invite code not found" });
    }

    res.json({
      id: found.id,
      grade: found.grade,
      letter: found.letter,
      school_name: found.school_name,
      city_name: found.city_name,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching class by code" });
  }
};

const joinByCode = async (req, res) => {
  try {
    const code = normalizeInviteCode(req.body.code);
    if (!isValidInviteCode(code)) {
      return res.status(400).json({ message: "Invalid invite code" });
    }

    const result = await services.joinClassByInviteCode(req.user.id, code);
    res.status(201).json(result);
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    res.status(500).json({ message: "Error joining class" });
  }
};

module.exports = {
  getMyClasses,
  createClass,
  getClass,
  rotateCode,
  getStudents,
  getStudent,
  removeStudent,
  lookupByCode,
  joinByCode,
};
