const express = require("express");
const classesController = require("../controllers/classesController");
const { authenticate, requireRole } = require("../middleware/auth");

const router = express.Router();

// Every route below works on the caller's own classes, so all of them need a token.
router.use(authenticate);

router.get("/", requireRole("teacher", "admin"), classesController.getMyClasses);
router.post("/", requireRole("teacher", "admin"), classesController.createClass);

router.post("/join", classesController.joinByCode);
router.get("/code/:code", classesController.lookupByCode);

router.get("/:id", requireRole("teacher", "admin"), classesController.getClass);
router.get(
  "/:id/students",
  requireRole("teacher", "admin"),
  classesController.getStudents,
);
router.get(
  "/:id/students/:studentId",
  requireRole("teacher", "admin"),
  classesController.getStudent,
);
router.delete(
  "/:id/students/:studentId",
  requireRole("teacher", "admin"),
  classesController.removeStudent,
);
router.post(
  "/:id/code",
  requireRole("teacher", "admin"),
  classesController.rotateCode,
);

module.exports = router;
