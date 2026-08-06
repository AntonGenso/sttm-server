const express = require("express");
const missionsController = require("../controllers/missionsController");
const { authenticate, requireRole } = require("../middleware/auth");
const { missionFiles } = require("../middleware/upload");
const router = express.Router();

router.get("/", missionsController.getMissions);
// Signed document links are handed out here, so the caller must be known.
router.get("/:id", authenticate, missionsController.getMission);

// Teachers only read the mission list; changing one is an admin action.
router.post(
  "/",
  authenticate,
  requireRole("admin"),
  missionFiles,
  missionsController.createMission,
);
router.patch(
  "/:id",
  authenticate,
  requireRole("admin"),
  missionFiles,
  missionsController.updateMission,
);
router.delete(
  "/:id",
  authenticate,
  requireRole("admin"),
  missionsController.deleteMission,
);

module.exports = router;
