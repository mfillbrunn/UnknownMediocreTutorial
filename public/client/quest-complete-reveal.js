// client/quest-complete-reveal.js — the guesser's quest-complete moment:
// "QUEST COMPLETED" types itself out, gets sucked off screen, and a reward
// card takes its place. Replaces the old showBigAnnounce popup for this
// one case (see power-functions.js's greenLetterRevealed handler).
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function playGuesserQuest() {
  const root = document.querySelector("#questReward");
  const output = document.querySelector("#questTyped");
  if (!root || !output) return;

  const text = "QUEST COMPLETED";

  // A second completion arriving before the first has finished dismissing
  // (back-to-back quests) restarts clean rather than layering timers.
  clearTimeout(root.__dismissTimer);
  clearTimeout(root.__cleanupTimer);
  root.classList.remove("whoosh", "reveal");
  root.classList.add("is-active");
  output.textContent = "";

  // Fast typewriter
  for (const char of text) {
    output.textContent += char;
    await wait(27);
  }

  await wait(260);

  // Suck the text away
  root.classList.add("whoosh");

  await wait(190);

  // Reward arrives before the whoosh has completely disappeared
  root.classList.add("reveal");

  // Not in the original beat -- but something has to eventually clear the
  // card, or it just sits on screen forever after the one animation runs.
  root.__dismissTimer = setTimeout(() => {
    root.classList.remove("is-active");
    root.__cleanupTimer = setTimeout(() => {
      root.classList.remove("whoosh", "reveal");
    }, 260);
  }, 2600);
}

window.playGuesserQuest = playGuesserQuest;
