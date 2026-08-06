const pool = require("../config/db");

/**
 * Counters for the admin dashboard, gathered in a single round trip.
 *
 * Teachers and students are counted by granted role, so an account that holds
 * both is counted in both — the numbers answer "how many accounts can do X",
 * not "how many people are registered".
 */
const getOverview = async () => {
  try {
    const [rows] = await pool.query(
      `SELECT
         (SELECT COUNT(*)
            FROM user_roles ur
            JOIN roles r ON r.id = ur.role_id
           WHERE r.name = 'teacher')                              AS teachers,
         (SELECT COUNT(*)
            FROM user_roles ur
            JOIN roles r ON r.id = ur.role_id
           WHERE r.name = 'student')                              AS students,
         (SELECT COUNT(*) FROM missions)                          AS missions,
         (SELECT COUNT(*) FROM classes)                           AS classes,
         (SELECT COUNT(*) FROM schools)                           AS schools,
         (SELECT COUNT(*) FROM class_students
           WHERE status <> 'removed')                             AS enrollments,
         (SELECT COUNT(*) FROM users)                             AS users`,
    );

    return rows[0];
  } catch (error) {
    console.error(error);
    throw new Error("Error fetching stats");
  }
};

module.exports = {
  getOverview,
};
