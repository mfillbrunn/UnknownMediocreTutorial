const level1 = require("./level1AI");
const level2 = require("./level2AI");
const level3 = require("./level3AI");

function getAI(state) {
  switch (state.aiDifficulty) {
    case 3:
      return level3;
    case 2:
      return level2;
    default:
      return level1;
  }
}

module.exports = { getAI };
