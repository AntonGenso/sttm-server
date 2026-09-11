const express = require("express");
const adminController = require("../controllers/adminController");
const { authenticate, requireRole } = require("../middleware/auth");

const router = express.Router();

// The whole directory is an admin area: it reads across every teacher's classes
// and writes to accounts that are not the caller's own. `/classes` here is the
// academy-wide list, which the teacher-facing `/classes` deliberately is not.
router.use(authenticate, requireRole("admin"));

router.get("/teachers", adminController.getTeachers);
router.get("/teachers/:id", adminController.getTeacher);
router.patch("/teachers/:id", adminController.updateTeacher);
router.delete("/teachers/:id", adminController.deleteTeacher);

router.get("/students", adminController.getStudents);
router.get("/students/:id", adminController.getStudent);
router.patch("/students/:id", adminController.updateStudent);
router.delete("/students/:id", adminController.deleteStudent);

router.get("/classes", adminController.getClasses);
router.get("/classes/:id", adminController.getClass);
router.patch("/classes/:id", adminController.updateClass);
router.delete("/classes/:id", adminController.deleteClass);

router.get("/schools", adminController.getSchools);
router.get("/schools/:id", adminController.getSchool);
router.patch("/schools/:id", adminController.updateSchool);
// Слияние дублей: школа из пути исчезает, всё её содержимое переезжает в
// `targetId`. Отдельный маршрут, а не флаг в PATCH — операция необратимая.
router.post("/schools/:id/merge", adminController.mergeSchool);
router.delete("/schools/:id", adminController.deleteSchool);

// Справочник городов целиком админский: в приложении города больше не вводят
// руками, поэтому единственный способ завести новый — отсюда.
router.get("/cities", adminController.getCities);
router.post("/cities", adminController.createCity);
router.get("/cities/:id", adminController.getCity);
router.patch("/cities/:id", adminController.updateCity);
router.post("/cities/:id/merge", adminController.mergeCity);
router.delete("/cities/:id", adminController.deleteCity);

router.get("/enrollments", adminController.getEnrollments);
// Soft removal, like the teacher-facing one: the membership ends, the student's
// progress does not.
router.delete("/enrollments/:id", adminController.removeEnrollment);

module.exports = router;
