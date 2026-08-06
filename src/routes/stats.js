const express = require("express");
const statsController = require("../controllers/statsController");
const { authenticate, requireRole } = require("../middleware/auth");

const router = express.Router();

// Academy-wide numbers are an admin view; teachers only see their own classes.
router.get(
  "/overview",
  authenticate,
  requireRole("admin"),
  statsController.getOverview,
);

module.exports = router;
