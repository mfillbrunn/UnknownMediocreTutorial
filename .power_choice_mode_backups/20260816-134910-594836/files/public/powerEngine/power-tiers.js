(() => {
  "use strict";
  window.POWER_TIERS = Object.freeze({
    confuseColors:{role:"setter",tier:1}, countOnly:{role:"setter",tier:1},
    fakeFeedback:{role:"setter",tier:1}, blindGuess:{role:"setter",tier:1},
    forceTimer:{role:"setter",tier:1}, delayedIntel:{role:"setter",tier:1},
    hideTile:{role:"setter",tier:2}, blindSpot:{role:"setter",tier:2},
    suggestSecret:{role:"setter",tier:2}, vowelRefresh:{role:"setter",tier:2},
    forceGuess:{role:"setter",tier:2}, revealPenalty:{role:"setter",tier:2},
    letterLockout:{role:"setter",tier:3}, assassinWord:{role:"setter",tier:3},
    revealGreen:{role:"guesser",tier:1}, freezeSecret:{role:"guesser",tier:1},
    rouletteSecret:{role:"guesser",tier:1}, stealthGuess:{role:"guesser",tier:1},
    nonsense:{role:"guesser",tier:1}, magicMode:{role:"guesser",tier:1},
    suggestGuess:{role:"guesser",tier:2}, revealHistory:{role:"guesser",tier:2},
    letterProbe:{role:"guesser",tier:2}, revealLocation:{role:"guesser",tier:2},
    letterProfile:{role:"guesser",tier:2}, betMiss:{role:"guesser",tier:2},
    wiretap:{role:"guesser",tier:3}, doubleGuess:{role:"guesser",tier:3},
    fieldReport:{role:"guesser",tier:3}
  });
})();
