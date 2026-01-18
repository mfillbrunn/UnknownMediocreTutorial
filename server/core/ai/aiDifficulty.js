const level1 = require("./level1AI");
const level2 = require("./level2AI");

function getAI(state) {
  switch (state.aiDifficulty) {
    case 2:
    case "medium":
      return level2;

    case 1:
    case "easy":
    default:
      return level1;
  }
}

module.exports = { getAI };
