// server/single-player/stageSchema.js
//
// Validates one stage definition's shape against the current engine's real
// power/quest/rule/word vocabulary. Stage files contain data only -- no
// executable code -- so validation here is what keeps a typo (an unknown
// power id, a word that isn't in the dictionary, a rule that doesn't
// exist) from becoming a runtime surprise instead of a startup failure.
//
// Cross-stage checks (duplicate ids, dangling map.next links) live in
// stageRegistry.js, which has the full stage set; this module only
// validates a single stage against a supplied vocabulary context.

"use strict";

const { KNOWN_OBJECTIVE_TYPES } = require("./objectiveEngine");
const { KNOWN_RULE_IDS } = require("./rules/registry");

const ROLES = new Set(["guesser", "setter", "both"]);
const START_MODES = new Set(["free", "prefill", "forced"]);
const DIFFICULTIES = new Set([1, 2, 3]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isSafeAssetPath(assetPath, stageId) {
  if (!isNonEmptyString(assetPath)) return false;
  const expectedPrefix = `/single-player/assets/stages/${stageId}/`;
  return (
    assetPath.startsWith(expectedPrefix) &&
    !assetPath.includes("..") &&
    !/^[a-z]+:/i.test(assetPath.slice(1)) // no scheme (e.g. "javascript:", "https:") smuggled in
  );
}

function isValidWord(word, dictionary) {
  return (
    isNonEmptyString(word) &&
    /^[A-Z]{5}$/.test(word.toUpperCase()) &&
    dictionary instanceof Set &&
    dictionary.has(word.toUpperCase())
  );
}

// Validates one objective/ranking-band expression node (leaf or all/any/not)
// against KNOWN_OBJECTIVE_TYPES. Pushes any problems onto `errors`.
function validateExpression(node, path, errors) {
  if (!isPlainObject(node)) {
    errors.push(`${path}: expression must be an object`);
    return;
  }
  if (Array.isArray(node.all) || Array.isArray(node.any)) {
    const list = node.all || node.any;
    const key = node.all ? "all" : "any";
    list.forEach((child, index) => validateExpression(child, `${path}.${key}[${index}]`, errors));
    return;
  }
  if (node.not) {
    validateExpression(node.not, `${path}.not`, errors);
    return;
  }
  if (!isNonEmptyString(node.type)) {
    errors.push(`${path}: missing objective type`);
    return;
  }
  if (!KNOWN_OBJECTIVE_TYPES.includes(node.type)) {
    errors.push(`${path}: unknown objective type "${node.type}"`);
  }
}

function validateStoryFrames(frames, fieldName, stageId, errors) {
  if (frames === undefined) return;
  if (!Array.isArray(frames)) {
    errors.push(`${fieldName}: frames must be an array`);
    return;
  }
  frames.forEach((frame, index) => {
    const path = `${fieldName}[${index}]`;
    if (!isNonEmptyString(frame?.id)) errors.push(`${path}: missing id`);
    if (frame?.image != null && !isSafeAssetPath(frame.image, stageId)) {
      errors.push(`${path}.image: unsafe or missing asset path (must be under /single-player/assets/stages/${stageId}/)`);
    }
    if (frame?.image != null && !isNonEmptyString(frame?.alt)) {
      errors.push(`${path}: image is set but alt text is missing`);
    }
    if (!Array.isArray(frame?.beats) || !frame.beats.length) {
      errors.push(`${path}: must have at least one beat`);
      return;
    }
    frame.beats.forEach((beat, beatIndex) => {
      const beatPath = `${path}.beats[${beatIndex}]`;
      if (!isNonEmptyString(beat?.id)) errors.push(`${beatPath}: missing id`);
      if (!isNonEmptyString(beat?.text)) errors.push(`${beatPath}: missing text`);
      if (beat?.side && beat.side !== "left" && beat.side !== "right") {
        errors.push(`${beatPath}: side must be "left" or "right"`);
      }
    });
  });
}

function validateStartConfig(start, fieldName, dictionary, errors) {
  if (!isPlainObject(start)) {
    errors.push(`${fieldName}: missing`);
    return;
  }
  if (!START_MODES.has(start.mode)) {
    errors.push(`${fieldName}.mode: must be one of ${[...START_MODES].join("/")}`);
  }
  if (start.mode === "prefill" || start.mode === "forced") {
    if (!isValidWord(start.word, dictionary)) {
      errors.push(`${fieldName}.word: "${start.word}" is not a valid 5-letter dictionary word`);
    }
  }
}

// vocabulary: { powerIds: Set<string>, questTypes: Set<string>,
//               allowedSecrets: Set<string>, allowedGuesses: Set<string> }
function validateStage(stage, vocabulary) {
  const errors = [];

  if (!isNonEmptyString(stage?.id)) {
    return { valid: false, errors: ["stage.id is required"] };
  }
  const stageId = stage.id;

  if (!Number.isInteger(stage.version) || stage.version < 1) {
    errors.push(`${stageId}.version must be a positive integer`);
  }
  if (!Number.isInteger(stage.chapter)) errors.push(`${stageId}.chapter must be an integer`);
  if (!Number.isInteger(stage.order)) errors.push(`${stageId}.order must be an integer`);
  if (!isNonEmptyString(stage.title)) errors.push(`${stageId}.title is required`);
  if (!isNonEmptyString(stage.summary)) errors.push(`${stageId}.summary is required`);

  if (!isPlainObject(stage.map) || !isNonEmptyString(stage.map.label)) {
    errors.push(`${stageId}.map.label is required`);
  }
  if (stage.map && (typeof stage.map.x !== "number" || typeof stage.map.y !== "number")) {
    errors.push(`${stageId}.map.x/y must be numbers`);
  }
  if (stage.map?.next !== undefined && !Array.isArray(stage.map.next)) {
    errors.push(`${stageId}.map.next must be an array of stage ids`);
  }
  if (stage.prerequisites !== undefined && !Array.isArray(stage.prerequisites)) {
    errors.push(`${stageId}.prerequisites must be an array of stage ids`);
  }
  if (stage.cast !== undefined) {
    if (!isPlainObject(stage.cast)) {
      errors.push(`${stageId}.cast must be an object`);
    } else {
      if (!isNonEmptyString(stage.cast.human)) {
        errors.push(`${stageId}.cast.human must be a non-empty name`);
      }
      if (!isNonEmptyString(stage.cast.opponent)) {
        errors.push(`${stageId}.cast.opponent must be a non-empty name`);
      }
    }
  }

  validateStoryFrames(stage.preStory?.frames, `${stageId}.preStory`, stageId, errors);
  validateStoryFrames(stage.postStory?.frames, `${stageId}.postStory`, stageId, errors);

  const game = stage.game;
  if (!isPlainObject(game)) {
    errors.push(`${stageId}.game is required`);
  } else {
    if (!ROLES.has(game.roles)) errors.push(`${stageId}.game.roles must be one of guesser/setter/both`);
    if (game.firstRole && !["guesser", "setter"].includes(game.firstRole)) {
      errors.push(`${stageId}.game.firstRole must be guesser or setter`);
    }
    if (!DIFFICULTIES.has(game.difficulty)) errors.push(`${stageId}.game.difficulty must be 1, 2, or 3`);
    if (game.powerChoice !== undefined && typeof game.powerChoice !== "boolean") {
      errors.push(`${stageId}.game.powerChoice must be a boolean`);
    }
    if (
      game.completion?.requireCorrectGuess !== undefined &&
      typeof game.completion.requireCorrectGuess !== "boolean"
    ) {
      errors.push(`${stageId}.game.completion.requireCorrectGuess must be a boolean`);
    }

    if (game.human?.guesserStart) validateStartConfig(game.human.guesserStart, `${stageId}.game.human.guesserStart`, vocabulary.allowedGuesses, errors);
    if (game.human?.setterStart) validateStartConfig(game.human.setterStart, `${stageId}.game.human.setterStart`, vocabulary.allowedSecrets, errors);

    (game.ai?.guesserOpeningGuessesByAttempt || []).forEach((word, index) => {
      if (!isValidWord(word, vocabulary.allowedGuesses)) {
        errors.push(`${stageId}.game.ai.guesserOpeningGuessesByAttempt[${index}]: "${word}" is not a valid guess word`);
      }
    });
    (game.ai?.setterSecretsByAttempt || []).forEach((word, index) => {
      if (!isValidWord(word, vocabulary.allowedSecrets)) {
        errors.push(`${stageId}.game.ai.setterSecretsByAttempt[${index}]: "${word}" is not a valid secret word`);
      }
    });
    if (
      game.ai?.fixedSetterSecret !== undefined &&
      !isValidWord(game.ai.fixedSetterSecret, vocabulary.allowedSecrets)
    ) {
      errors.push(`${stageId}.game.ai.fixedSetterSecret: "${game.ai.fixedSetterSecret}" is not a valid secret word`);
    }
    if (
      game.ai?.lockSetterSecret !== undefined &&
      typeof game.ai.lockSetterSecret !== "boolean"
    ) {
      errors.push(`${stageId}.game.ai.lockSetterSecret must be a boolean`);
    }
    if (
      game.quests?.disabled !== undefined &&
      typeof game.quests.disabled !== "boolean"
    ) {
      errors.push(`${stageId}.game.quests.disabled must be a boolean`);
    }

    (game.quests?.guesserByRound || []).forEach((quest, index) => {
      if (quest && !vocabulary.questTypes.has(quest)) {
        errors.push(`${stageId}.game.quests.guesserByRound[${index}]: unknown quest type "${quest}"`);
      }
    });

    (game.rules || []).forEach((rule, index) => {
      if (!isNonEmptyString(rule?.id) || !KNOWN_RULE_IDS.includes(rule.id)) {
        errors.push(`${stageId}.game.rules[${index}]: unknown rule id "${rule?.id}"`);
      }
    });

    const policy = game.powerPolicy || {};
    for (const role of ["guesser", "setter"]) {
      for (const powerId of [...(policy.playerFixed?.[role] || []), ...(policy.opponentFixed?.[role] || [])]) {
        if (!vocabulary.powerIds.has(powerId)) {
          errors.push(`${stageId}.game.powerPolicy: unknown power id "${powerId}"`);
        }
      }
    }
  }

  const objectiveIds = new Set();
  (stage.objectives || []).forEach((objective, index) => {
    const path = `${stageId}.objectives[${index}]`;
    if (!isNonEmptyString(objective?.id)) {
      errors.push(`${path}: missing id`);
    } else if (objectiveIds.has(objective.id)) {
      errors.push(`${path}: duplicate objective id "${objective.id}"`);
    } else {
      objectiveIds.add(objective.id);
    }
    validateExpression(objective?.expression, `${path}.expression`, errors);
  });

  (stage.ranking?.bands || []).forEach((band, index) => {
    const path = `${stageId}.ranking.bands[${index}]`;
    if (!Number.isInteger(band?.stars) || band.stars < 0 || band.stars > 3) {
      errors.push(`${path}.stars must be an integer 0-3`);
    }
    validateExpression(band?.expression, `${path}.expression`, errors);
  });

  for (const unlock of stage.rewards?.unlockPowers || []) {
    if (!vocabulary.powerIds.has(unlock?.powerId)) {
      errors.push(`${stageId}.rewards.unlockPowers: unknown power id "${unlock?.powerId}"`);
    }
  }
  for (const choice of stage.rewards?.chooseOne || []) {
    if (!isNonEmptyString(choice?.id)) errors.push(`${stageId}.rewards.chooseOne: missing choice id`);
    for (const option of choice?.options || []) {
      if (!vocabulary.powerIds.has(option?.powerId)) {
        errors.push(`${stageId}.rewards.chooseOne[${choice?.id}]: unknown power id "${option?.powerId}"`);
      }
    }
  }
  if (stage.rewards?.unlockStages !== undefined && !Array.isArray(stage.rewards.unlockStages)) {
    errors.push(`${stageId}.rewards.unlockStages must be an array of stage ids`);
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateStage, isSafeAssetPath, isValidWord };
