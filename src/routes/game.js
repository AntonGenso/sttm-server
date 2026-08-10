const express = require("express");
const gameController = require("../controllers/gameController");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// Everything here is scoped to the caller (`req.user.id`), so it only needs a
// valid token — the student can read and write nothing but their own state.
router.get("/profile", authenticate, gameController.getProfile);
router.get("/leaderboard", authenticate, gameController.getLeaderboard);

router.post("/missions/:id/start", authenticate, gameController.startMission);
router.post("/missions/:id/submit", authenticate, gameController.submitMission);

router.post("/tests/:id/start", authenticate, gameController.startTest);
router.post("/tests/:id/submit", authenticate, gameController.submitTest);

router.patch("/skin", authenticate, gameController.updateSkin);

module.exports = router;
