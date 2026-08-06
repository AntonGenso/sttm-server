const services = require("../services/classesService");
const {
  GRADE_MIN,
  GRADE_MAX,
  normalizeInviteCode,
  isValidInviteCode,
  parseGrade,
  parseLetter,
} = require("../utils/classes");

const SCHOOL_NAME_MAX_LENGTH = 255;

const getMyClasses = async (req, res) => {
  try {
    const result = await services.getTeacherClasses(req.user.id);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching classes" });
  }
};

const createClass = async (req, res) => {
  try {
    const { cityId, schoolName, grade, letter } = req.body;

    const city = Number(cityId);
    if (!Number.isInteger(city) || city <= 0) {
      return res.status(400).json({ message: "City is required" });
    }

    if (typeof schoolName !== "string" || !schoolName.trim()) {
      return res.status(400).json({ message: "School name is required" });
    }
    if (schoolName.trim().length > SCHOOL_NAME_MAX_LENGTH) {
      return res.status(400).json({
        message: `School name must be at most ${SCHOOL_NAME_MAX_LENGTH} characters long`,
      });
    }

    const parsedGrade = parseGrade(grade);
    if (!parsedGrade) {
      return res
        .status(400)
        .json({ message: `Grade must be between ${GRADE_MIN} and ${GRADE_MAX}` });
    }

    const parsedLetter = parseLetter(letter);
    if (!parsedLetter) {
      return res.status(400).json({ message: "Unknown class letter" });
    }

    const result = await services.createClass({
      teacherId: req.user.id,
      cityId: city,
      schoolName: schoolName.trim(),
      grade: parsedGrade,
      letter: parsedLetter.letter,
      alphabet: parsedLetter.alphabet,
    });

    res.status(201).json(result);
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
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
  lookupByCode,
  joinByCode,
};
