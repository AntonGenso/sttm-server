const express = require("express");
require("dotenv").config();
const cors = require("cors");

const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");
const documentsRouter = require("./routes/documents");
const rolesRouter = require("./routes/roles");
const missionsRouter = require("./routes/missions");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "sttm-server" });
});

app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/documents", documentsRouter);
app.use("/roles", rolesRouter);
app.use("/missions", missionsRouter);

app.use((req, res) => {
  res.status(404).json({ message: "Router not found" });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res
    .status(err.status || 500)
    .json({ message: err.message || "Internal Server Error" });
});

module.exports = app;
