const express = require("express");
const schoolsController = require("../controllers/schoolsController");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

router.get("/", authenticate, schoolsController.getSchools);

module.exports = router;
