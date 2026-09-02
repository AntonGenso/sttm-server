const express = require("express");
const testsController = require("../controllers/testsController");
const { authenticate, requireRole } = require("../middleware/auth");
const { testFiles } = require("../middleware/upload");
const router = express.Router();

// The catalog carries no questions, but it does expose unpublished tests, so it
// stays behind a login — the panel is the only thing reading it today.
router.get("/", authenticate, testsController.getTests);

// The full test includes the right answer to every question. Staff only: a
// student holding a valid token must never be able to read the answer key.
router.get(
  "/:id",
  authenticate,
  requireRole("admin", "teacher"),
  testsController.getTest,
);

// What the game loads to run a test. Open to any signed-in student, and it
// answers 404 for a hidden test or one whose date has not come — so the panel's
// staff-only route above stays the only way to read an unpublished test.
router.get("/:id/play", authenticate, testsController.getTestForPlay);

// Teachers only read tests; creating and changing one is an admin action.
router.post(
  "/",
  authenticate,
  requireRole("admin"),
  testFiles,
  testsController.createTest,
);
router.patch(
  "/:id",
  authenticate,
  requireRole("admin"),
  testFiles,
  testsController.updateTest,
);
router.delete(
  "/:id",
  authenticate,
  requireRole("admin"),
  testsController.deleteTest,
);

module.exports = router;
