const services = require("../services/documentsService");

const getDocuments = async (req, res) => {
  try {
    const result = await services.getDocuments();
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching documents" });
  }
};

module.exports = {
  getDocuments,
};
