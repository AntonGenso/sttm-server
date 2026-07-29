const express = require("express");
const missionsController = require("../controllers/missionsController");
const router = express.Router();

router.get("/", missionsController.getMissions);
router.post("/", missionsController.createMission);

module.exports = router;
