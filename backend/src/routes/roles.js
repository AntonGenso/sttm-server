const express = require("express");
const router = express.Router();
const controllers = require("../controllers/rolesController");

router.get("/", controllers.getRoles);

module.exports = router;
