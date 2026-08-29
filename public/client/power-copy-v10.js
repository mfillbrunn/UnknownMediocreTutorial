(() => {
  "use strict";

  const benefitCopy = {
    confuseColors: {
      short: "Helps the Secretkeeper by hiding which feedback tiles are green or yellow.",
      desc: "Helps the Secretkeeper by turning green and yellow feedback blue, so the Guesser cannot tell those colors apart for the round."
    },
    betMiss: {
      short: "Helps the Guesser earn a green clue by predicting the next miss count.",
      desc: "Helps the Guesser by betting how many grey tiles the next guess will have. A correct bet earns a free green clue."
    },
    spyChargeReset: {
      short: "Helps the Secretkeeper erase one letter's clues from the current round.",
      desc: "Helps the Secretkeeper by resetting one letter everywhere it appears in feedback and extra constraints this round."
    },
    fieldReport: {
      short: "Helps the Guesser earn a yellow or green clue by following shown conditions.",
      desc: "Helps the Guesser by showing three conditions. Matching conditions builds progress toward a free yellow or green clue."
    },
    fakeFeedback: {
      short: "Helps the Secretkeeper hide the real result beside a believable fake result.",
      desc: "Helps the Secretkeeper by showing the Guesser two feedback results: one real and one fake."
    },
    countOnly: {
      short: "Helps the Secretkeeper hide the positions of green and yellow tiles.",
      desc: "Helps the Secretkeeper by showing only the total number of green and yellow tiles, not their positions."
    },
    rouletteSecret: {
      short: "Helps the Guesser force the Secretkeeper's next secret to be chosen at random.",
      desc: "Helps the Guesser by forcing the Secretkeeper's next legal secret to be selected at random."
    },
    nonsense: {
      short: "Helps the Guesser test any five letters, even when they are not a real word.",
      desc: "Helps the Guesser by allowing one five-letter guess that does not need to be a dictionary word."
    },
    forceGuess: {
      short: "Helps the Secretkeeper restrict the Guesser's next guess with an extra rule.",
      desc: "Helps the Secretkeeper by adding a rule that the Guesser's next guess must follow."
    },
    forceTimer: {
      short: "Helps the Secretkeeper pressure the Guesser with a short guess timer.",
      desc: "Helps the Secretkeeper by giving the Guesser only a short time to submit the next guess."
    },
    freezeSecret: {
      short: "Helps the Guesser stop the Secretkeeper from changing the current secret.",
      desc: "Helps the Guesser by locking the Secretkeeper's current secret for the affected decision."
    },
    hideTile: {
      short: "Helps the Secretkeeper erase one chosen letter's clues from the round.",
      desc: "Helps the Secretkeeper by choosing a letter and erasing its feedback and extra constraints everywhere this round."
    },
    magicMode: {
      short: "Helps the Guesser turn yellow feedback into exact green positions.",
      desc: "Helps the Guesser by upgrading yellow feedback to green for the affected result."
    },
    revealGreen: {
      short: "Helps the Guesser learn one secret letter and its exact position.",
      desc: "Helps the Guesser by revealing one current secret letter in its exact box."
    },
    revealHistory: {
      short: "Helps the Guesser learn a secret that the Secretkeeper used earlier.",
      desc: "Helps the Guesser by revealing the secret from two scored guesses earlier."
    },
    revealLetter: {
      short: "Helps the Guesser earn a free green clue by completing a challenge.",
      desc: "Helps the Guesser by awarding a free exact green clue after a guess challenge is completed."
    },
    stealthGuess: {
      short: "Helps the Guesser hide the next guess from the Secretkeeper.",
      desc: "Helps the Guesser by making the next submitted guess invisible to the Secretkeeper before scoring."
    },
    suggestGuess: {
      short: "Helps the Guesser by suggesting a legal guess that fits known clues.",
      desc: "Helps the Guesser by suggesting a valid guess that matches everything currently known."
    },
    suggestSecret: {
      short: "Helps the Secretkeeper by suggesting a legal secret that still fits every clue.",
      desc: "Helps the Secretkeeper by suggesting a valid secret that remains consistent with all feedback."
    },
    vowelRefresh: {
      short: "Helps the Secretkeeper erase every vowel clue learned so far this match.",
      desc: "Helps the Secretkeeper by resetting every vowel clue learned so far this match, from feedback and matching extra constraints alike."
    },
    blindSpot: {
      short: "Helps the Secretkeeper hide one feedback position for the rest of the round.",
      desc: "Helps the Secretkeeper by concealing the clue in one tile position for the rest of the round."
    },
    revealPenalty: {
      short: "Helps the Secretkeeper score by making a letter claim the Guesser must judge.",
      desc: "Helps the Secretkeeper by claiming a letter is in the secret. The Guesser must accept the claim or call the bluff."
    },
    assassinWord: {
      short: "Helps the Secretkeeper win instantly if the Guesser guesses a planted trap word.",
      desc: "Helps the Secretkeeper by planting a trap word that ends the match immediately if the Guesser guesses it."
    },
    blindGuess: {
      short: "Helps the Secretkeeper hide all feedback and keyboard colors for one guess.",
      desc: "Helps the Secretkeeper by blacking out the Guesser's feedback and keyboard colors for the next guess."
    },
    wiretap: {
      short: "Helps the Guesser see how many possible secrets remain.",
      desc: "Helps the Guesser by showing a live count of how many secrets are still possible given the feedback so far."
    },
    letterProbe: {
      short: "Helps the Guesser test five random letters and learn how many are in the secret.",
      desc: "Helps the Guesser by testing five random letters (weighted toward still-unknown ones). It reveals how many are present, but not which ones or where."
    },
    revealLocation: {
      short: "Helps the Guesser watch one secret position and see its current letter.",
      desc: "Helps the Guesser by revealing the letter currently occupying one watched position until it is solved."
    },
    doubleGuess: {
      short: "Helps the Guesser submit two guesses and receive feedback for both.",
      desc: "Helps the Guesser by submitting two different guesses at once while the Secretkeeper sees only one of them."
    },
    letterProfile: {
      short: "Helps the Guesser see how many of the secret's letters are vowels.",
      desc: "Helps the Guesser by showing an always-on count of how many of the secret's 5 letters are vowels."
    },
    delayedIntel: {
      short: "Helps the Secretkeeper delay feedback until after the Guesser's following guess.",
      desc: "Helps the Secretkeeper by holding back the current feedback until the Guesser has submitted another guess."
    },
    firstLetterReveal: {
      short: "Helps the Guesser reveal the secret's first letter as a permanent green clue.",
      desc: "Helps the Guesser by revealing the secret's first letter as a permanent green clue at position 1 for the rest of the round."
    }
  };

  for (const [id, copy] of Object.entries(benefitCopy)) {
    const meta = window.POWER_METADATA?.[id];
    if (!meta) continue;
    meta.short = copy.short;
    meta.desc = copy.desc;
  }

  const opponentCopy = {
    confuseColors: "Your opponent makes green and yellow feedback appear blue for this round.",
    betMiss: "Your opponent predicts the miss count in their next guess and earns a green clue if correct.",
    fieldReport: "Your opponent follows shown conditions to build progress toward a yellow or green clue.",
    fakeFeedback: "Your opponent makes your feedback show one real result and one fake result.",
    countOnly: "Your opponent hides the positions of your green and yellow tiles and shows only the totals.",
    rouletteSecret: "Your opponent forces your next legal secret to be selected at random.",
    nonsense: "Your opponent may submit any five letters this turn, even when they do not form a dictionary word.",
    forceGuess: "Your opponent adds a rule that your next guess must follow.",
    forceTimer: "Your opponent places a short timer on your next guess.",
    freezeSecret: "Your opponent locks your current secret so you cannot change it for the affected decision.",
    hideTile: "Your opponent erases the chosen letter's clues and extra constraints from the current round.",
    magicMode: "Your opponent upgrades yellow feedback to green for the affected result.",
    revealGreen: "Your opponent learns one current secret letter and its exact position.",
    revealHistory: "Your opponent learns a secret that was used two scored guesses earlier.",
    firstLetterReveal: "Your opponent revealed the secret's first letter as a permanent green clue for the rest of the round.",
    revealLetter: "Your opponent completes a challenge to earn a free green clue.",
    stealthGuess: "Your opponent hides their next guess from you before it is scored.",
    suggestGuess: "Your opponent receives a suggested guess that fits all known clues.",
    suggestSecret: "Your opponent receives a suggested secret that still fits all feedback.",
    vowelRefresh: "Your opponent resets every vowel clue you've learned so far this match.",
    blindSpot: "Your opponent hides one feedback position for the rest of the round.",
    revealPenalty: "Your opponent makes a letter claim that you must accept or challenge.",
    assassinWord: "Your opponent plants a trap word that wins immediately if it is guessed.",
    blindGuess: "Your opponent hides all feedback and keyboard colors for your next guess.",
    wiretap: "Your opponent sees a live count of how many secrets are still possible.",
    letterProbe: "Your opponent tests five random letters and learns how many are in the secret.",
    revealLocation: "Your opponent watches one position and sees its current letter.",
    doubleGuess: "Your opponent submits two guesses and receives feedback for both while you see only one.",
    letterProfile: "Your opponent sees an always-on count of how many of the secret's letters are vowels.",
    delayedIntel: "Your opponent delays this feedback until after your following guess.",
    spyChargeReset: "Your opponent resets one letter's clues and extra constraints from the current round."
  };

  window.OPPONENT_POWER_DESCRIPTIONS = Object.freeze({
    ...(window.OPPONENT_POWER_DESCRIPTIONS || {}),
    ...opponentCopy
  });

  const questCopy = {
    ROW: "Use every letter from one keyboard row across your guesses.",
    RARE: "Use the required number of different rare letters across your guesses.",
    ALPHA: "Submit three words whose letters run in strict alphabetical order, forward or backward.",
    DOUBLES: "Submit three words with three different doubled letters.",
    CHAIN: "Start each new word with the last letter of the previous word.",
    HARDMODE: "Submit four guesses that use every green and yellow clue already known.",
    FIELDREPORT: "Match the shown conditions. Each condition you match adds one point.",
    ALTERNATING: "Submit three words that alternate consonants and vowels.",
    BOOKENDS: "Submit three words whose first and last letters match.",
    HALF_AM: "Submit three words using only letters A through P.",
    HALF_NZ: "Submit three words using only letters K through Z.",
    VOWELSHORTAGE: "Submit four words with exactly the requested number of vowels."
  };

  for (const [type, desc] of Object.entries(questCopy)) {
    const meta = window.QUEST_METADATA?.[type];
    if (!meta) continue;
    meta.desc = desc;
    delete meta.examples;
  }
})();
