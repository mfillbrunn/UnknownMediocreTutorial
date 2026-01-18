const fs = require("fs");
const path = require("path");

function loadWordList() {
  const file = fs.readFileSync(
    path.join(__dirname, "../wordlists/allowed_words.txt"),
    "utf8"
  );

  const lines = file.trim().split(/\r?\n/);
  const header = lines.shift().split(/\t+/);

  const rows = lines.map(line => {
    const cols = line.split(/\t+/);
    const row = {};
    header.forEach((h, i) => (row[h] = cols[i]));
    return {
      word: row["Feasible.Guesses"]?.toUpperCase(),
      isGuess: row["Feasible.Guesses"] === "TRUE",
      isSecret: row["Feasible.Secrets"] === "TRUE",
      probability: Number(row["Probability"]) || 0,
      frequency: Number(row["Frequency"]) || 0
    };
  });

  return {
    all: rows,
    guesses: rows.filter(r => r.isGuess),
    secrets: rows.filter(r => r.isSecret)
  };
}

module.exports = { loadWordList };
