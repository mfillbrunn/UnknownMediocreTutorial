"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const THEME_DATA_PATH = path.join(__dirname, "..", "wordlists", "cuddle_secret_themes.json");
let cachedThemeData = null;

function normalizeWord(value) {
  const word = String(value || "").trim().toLowerCase();
  return /^[a-z]{5}$/.test(word) ? word : "";
}

function loadThemeData() {
  if (cachedThemeData) return cachedThemeData;
  const parsed = JSON.parse(fs.readFileSync(THEME_DATA_PATH, "utf8"));
  if (!parsed || typeof parsed !== "object" || !parsed.wordThemes || !parsed.themes) {
    throw new Error("Cuddle theme data is missing wordThemes or themes.");
  }
  cachedThemeData = parsed;
  return cachedThemeData;
}

function getRevealableCategories(word) {
  const normalized = normalizeWord(word);
  if (!normalized) return [];
  const data = loadThemeData();
  const ids = Array.isArray(data.wordThemes[normalized]) ? data.wordThemes[normalized] : [];
  return ids
    .map(id => {
      const theme = data.themes[id];
      // "general" is only the explicit fallback for words without a useful
      // category. Every other assigned broad category can be earned as a hint.
      if (!theme || id === "general") return null;
      return {
        id,
        label: String(theme.label || id),
        group: String(theme.group || "other")
      };
    })
    .filter(Boolean);
}

// Backward-compatible alias for early local builds of this updater.
const getFlavorCategories = getRevealableCategories;

function secureShuffle(items) {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function chooseCategoryHints({ word, knownCategories = [], count = 1 }) {
  const categories = getRevealableCategories(word);
  const known = new Set(
    (Array.isArray(knownCategories) ? knownCategories : [])
      .map(value => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const requested = Math.max(1, Math.min(8, Math.floor(Number(count) || 1)));
  const available = categories.filter(category => !known.has(category.id));
  const selected = secureShuffle(available).slice(0, requested);
  const noCategory = categories.length === 0;
  const exhausted = available.length <= selected.length;
  let message;
  if (selected.length === 1) message = `Category revealed: ${selected[0].label}.`;
  else if (selected.length > 1) message = `Categories revealed: ${selected.map(item => item.label).join(", ")}.`;
  else if (noCategory) message = "No category.";
  else message = "No more categories.";
  return {
    categories: selected,
    noCategory,
    exhausted,
    message
  };
}

function registerCuddleWordThemeRoutes(app, { allowedSecrets = [] } = {}) {
  if (!app || typeof app.post !== "function") {
    throw new TypeError("registerCuddleWordThemeRoutes needs an Express app.");
  }
  const secretSet = new Set(
    (Array.isArray(allowedSecrets) ? allowedSecrets : [])
      .map(normalizeWord)
      .filter(Boolean)
  );

  // The complete word-to-theme dictionary never enters /public. The browser
  // receives only the hint(s) earned for the current solution.
  app.post("/api/cuddle/category-hint", (req, res) => {
    res.set("Cache-Control", "no-store");
    const word = normalizeWord(req.body?.word);
    if (!word || !secretSet.has(word)) {
      return res.status(400).json({ error: "Unknown Cuddle secret." });
    }
    const result = chooseCategoryHints({
      word,
      knownCategories: req.body?.knownCategories,
      count: req.body?.count
    });
    return res.json(result);
  });
}

module.exports = {
  THEME_DATA_PATH,
  normalizeWord,
  loadThemeData,
  getRevealableCategories,
  getFlavorCategories,
  chooseCategoryHints,
  registerCuddleWordThemeRoutes
};
