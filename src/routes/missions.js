const express = require("express");
const missionsController = require("../controllers/missionsController");
const { authenticate, requireRole } = require("../middleware/auth");
const { missionFiles } = require("../middleware/upload");
const router = express.Router();

router.get("/", missionsController.getMissions);
// Signed document links are handed out here, so the caller must be known.
router.get("/:id", authenticate, missionsController.getMission);

// Презентация миссии. Отдельный маршрут, а не поле в карточке: выдача ссылки
// и запись «учитель открыл презентацию» — одно действие (см. openTeacherGuide).
// Роль не проверяется: презентацию открывают учителя, ради них счётчик и заведён.
router.get(
  "/:id/teacher-guide/:locale",
  authenticate,
  missionsController.openTeacherGuide,
);

// «Начать урок». POST, а не GET: запись события — изменение, и браузер не
// должен повторять её при возврате назад. Роль не проверяется, как и у
// презентации: урок начинают учителя.
router.post("/:id/lesson-start", authenticate, missionsController.startLesson);

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
