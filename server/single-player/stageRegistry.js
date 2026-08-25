// server/single-player/stageRegistry.js
//
// Loads every stage definition from ./stages, validates each one (and the
// graph as a whole -- duplicate ids, dangling map.next/prerequisite links),
// and freezes the result. A new stage is added almost entirely by adding
// one file under ./stages and listing it in ./stages/index.js -- nothing
// else in this file needs to change.

"use strict";

const { validateStage } = require("./stageSchema");
const POWER_METADATA = require("../powers/powerMetadata");
const { QUEST_TYPES } = require("../powers/powers/questServer");
const STAGES = require("./stages");

let registry = null;

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.getOwnPropertyNames(value).forEach(key => deepFreeze(value[key]));
    Object.freeze(value);
  }
  return value;
}

function buildVocabulary(context) {
  return {
    powerIds: new Set(Object.keys(POWER_METADATA)),
    questTypes: new Set(QUEST_TYPES),
    allowedSecrets: new Set((context?.ALLOWED_SECRETS || []).map(w => String(w).toUpperCase())),
    allowedGuesses: new Set((context?.ALLOWED_GUESSES || []).map(w => String(w).toUpperCase()))
  };
}

// Validates and freezes the whole stage set. Throws on any problem --
// meant to be called once at server startup, so a bad stage definition
// fails loudly before the process ever accepts a connection, rather than
// surfacing as a confusing runtime error mid-game.
function loadRegistry(context) {
  const vocabulary = buildVocabulary(context);
  const byId = new Map();
  const errors = [];

  for (const stage of STAGES) {
    if (!stage || typeof stage.id !== "string") {
      errors.push("A stage definition is missing a valid id");
      continue;
    }
    if (byId.has(stage.id)) {
      errors.push(`Duplicate stage id "${stage.id}"`);
      continue;
    }
    const result = validateStage(stage, vocabulary);
    if (!result.valid) {
      errors.push(...result.errors);
      continue;
    }
    byId.set(stage.id, stage);
  }

  for (const stage of byId.values()) {
    for (const nextId of stage.map?.next || []) {
      if (!byId.has(nextId)) {
        errors.push(`Stage "${stage.id}" links to unknown stage "${nextId}" in map.next`);
      }
    }
    for (const prereqId of stage.prerequisites || []) {
      if (!byId.has(prereqId)) {
        errors.push(`Stage "${stage.id}" has unknown prerequisite "${prereqId}"`);
      }
    }
  }

  if (errors.length) {
    throw new Error(
      `Single-player stage registry failed validation:\n${errors.map(e => `  - ${e}`).join("\n")}`
    );
  }

  for (const stage of byId.values()) deepFreeze(stage);

  registry = byId;
  return registry;
}

function getStage(id) {
  return registry?.get(id) || null;
}

function getAllStages() {
  return registry ? [...registry.values()] : [];
}

function isLoaded() {
  return !!registry;
}

module.exports = { loadRegistry, getStage, getAllStages, isLoaded };
