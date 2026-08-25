// client/quest-complete-reveal.js — the local guesser's quest-complete
// moment: "QUEST COMPLETED" types itself out, gets sucked away in a
// horizontal-compression "whoosh", and a reward card (icon, quest name,
// completion line, a few particles) takes its place, then the whole
// overlay fades and resets so it's ready for a later quest.
//
// This file owns ONLY the presentation (building/animating the overlay).
// It does not decide WHEN a quest completed -- that's driven by the two
// socket events the server already emits at the exact moment a quest's
// one-time reward is granted (see server/powers/powers/questServer.js):
//   - "greenLetterRevealed" (source: "quest") -- the full reward
//   - "questEarlyClaim" -- the early yellow-letter trade
// Both are one-shot, server-authoritative signals for the real
// incomplete -> complete transition: they only ever fire once per quest
// instance (questServer.js gates on q.used), and a reconnect re-syncs
// state via a plain stateUpdate rather than replaying past events, so
// there's no separate "have we already shown this" bookkeeping to get
// wrong here -- see public/client/power-functions.js and
// public/client/quest.js for where these are wired to playQuestCompletion.
(() => {
  "use strict";

  const TYPE_SPEED = 28;
  const TYPE_HOLD = 230;
  const WHOOSH_TO_REWARD = 155;
  const REWARD_HOLD = 1250;
  const FADE_TIME = 300;

  let isPlaying = false;

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function ensureOverlay() {
    let root = document.getElementById("questReward");
    if (root) return root;

    root = document.createElement("div");
    root.id = "questReward";
    root.setAttribute("aria-hidden", "true");

    root.innerHTML = `
      <div class="quest-reward-backdrop"></div>
      <div class="quest-reward-stage">
        <div class="quest-message">
          <span class="quest-message-text"></span><span class="quest-message-cursor"></span>
        </div>
        <div class="quest-reward-card">
          <div class="quest-reward-icon-wrap">
            <svg class="quest-reward-icon" viewBox="0 0 100 100" aria-hidden="true">
              <circle class="quest-reward-ring" cx="50" cy="50" r="31" fill="none" stroke="currentColor" stroke-width="3"/>
              <path class="quest-reward-star"
                d="M50 25 L57 42 L76 43 L61 55 L66 74 L50 64 L34 74 L39 55 L24 43 L43 42 Z"
                fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>
            </svg>
            <div class="quest-reward-particles" aria-hidden="true">
              <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
            </div>
          </div>
          <div class="quest-reward-title"></div>
          <div class="quest-reward-description"></div>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    return root;
  }

  function resetOverlay(root) {
    clearTimeout(root.__cleanupTimer);
    root.classList.remove("is-active", "whoosh", "reveal", "fade-out");
    root.setAttribute("aria-hidden", "true");

    const typed = root.querySelector(".quest-message-text");
    const title = root.querySelector(".quest-reward-title");
    const description = root.querySelector(".quest-reward-description");
    if (typed) typed.textContent = "";
    if (title) title.textContent = "";
    if (description) description.textContent = "";
  }

  async function typeText(element, text) {
    element.textContent = "";
    for (const char of text) {
      element.textContent += char;
      await wait(TYPE_SPEED);
    }
  }

  // options: { title, description, color } -- title/description are the
  // quest's own name/completion line (see the callers: both resolve these
  // from computeQuestStatus(state), the same status object the quest badge
  // itself renders from, never invented here). color is a CSS color value
  // (a var(...) reference is fine) for the icon/particles/cursor accent --
  // callers pass the reward's own tile color (green/yellow) with the
  // guesser's role color as the fallback.
  async function playQuestCompletion(options = {}) {
    if (isPlaying) return;
    isPlaying = true;

    const root = ensureOverlay();
    resetOverlay(root);

    const typed = root.querySelector(".quest-message-text");
    const title = root.querySelector(".quest-reward-title");
    const description = root.querySelector(".quest-reward-description");

    title.textContent = options.title || options.name || "QUEST REWARD";
    description.textContent = options.description || "Quest completed";
    root.style.setProperty("--quest-reward-color", options.color || options.accentColor || "var(--guesser-color)");

    root.setAttribute("aria-hidden", "false");
    void root.offsetWidth; // flush layout so is-active reliably transitions
    root.classList.add("is-active");

    try {
      await typeText(typed, "QUEST COMPLETED");
      await wait(TYPE_HOLD);

      // Text shoots upward -- reward starts arriving before the whoosh has
      // fully finished, so the two beats feel connected rather than sequential.
      root.classList.add("whoosh");
      await wait(WHOOSH_TO_REWARD);
      root.classList.add("reveal");

      await wait(REWARD_HOLD);

      root.classList.add("fade-out");
      await wait(FADE_TIME);
    } finally {
      resetOverlay(root);
      isPlaying = false;
    }
  }

  window.playQuestCompletion = playQuestCompletion;
})();
