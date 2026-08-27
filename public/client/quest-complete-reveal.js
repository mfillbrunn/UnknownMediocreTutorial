// client/quest-complete-reveal.js -- typed Guesser quest-complete sequence.
//
// The message materializes one letter at a time in the Guesser color, then
// compresses and shoots upward. In normal modes the quest reward card appears
// underneath. Power Choice can request the transition-only version and open
// its real reward picker as soon as the whoosh has cleared.
(() => {
  "use strict";

  const TYPE_SPEED = 32;
  const TYPE_HOLD = 220;
  const WHOOSH_TO_REWARD = 150;
  const TRANSITION_SETTLE = 170;
  const REWARD_HOLD = 1150;
  const FADE_TIME = 280;

  let activePromise = null;

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function nextFrame() {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
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
        <div class="quest-message" role="status" aria-live="polite">
          <span class="quest-message-text"></span>
        </div>
        <div class="quest-reward-card">
          <div class="quest-reward-icon-wrap">
            <svg class="quest-reward-icon" viewBox="0 0 100 100" aria-hidden="true">
              <circle class="quest-reward-ring" cx="50" cy="50" r="31"
                fill="none" stroke="currentColor" stroke-width="3"/>
              <path class="quest-reward-star"
                d="M50 25 L57 42 L76 43 L61 55 L66 74 L50 64 L34 74 L39 55 L24 43 L43 42 Z"
                fill="none" stroke="currentColor" stroke-width="4"
                stroke-linejoin="round"/>
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
    root.classList.remove("is-active", "whoosh", "reveal", "fade-out");
    root.setAttribute("aria-hidden", "true");
    const typed = root.querySelector(".quest-message-text");
    const title = root.querySelector(".quest-reward-title");
    const description = root.querySelector(".quest-reward-description");
    if (typed) typed.replaceChildren();
    if (title) title.textContent = "";
    if (description) description.textContent = "";
  }

  function buildLetters(element, text) {
    element.replaceChildren();
    const fragment = document.createDocumentFragment();
    const letters = [];
    for (const character of String(text || "")) {
      const span = document.createElement("span");
      span.className = "quest-typed-char";
      span.textContent = character === " " ? "\u00a0" : character;
      fragment.appendChild(span);
      letters.push(span);
    }
    element.appendChild(fragment);
    return letters;
  }

  async function typeFromThinAir(element, text) {
    const letters = buildLetters(element, text);
    await nextFrame();
    for (const letter of letters) {
      letter.classList.add("is-visible");
      await wait(TYPE_SPEED);
    }
  }

  /**
   * options:
   *   text: message to type (default: "Quest completed")
   *   title/description/color: reward-card content
   *   messageColor: typed-message color (defaults to Guesser blue)
   *   showReward: false for Power Choice, whose real reward picker follows
   */
  function playQuestCompletion(options = {}) {
    // The server can emit the completion event and the Power Choice state
    // update in either order. Reuse the one in-flight sequence so the player
    // never sees the message twice.
    if (activePromise) return activePromise;

    const root = ensureOverlay();
    resetOverlay(root);

    const typed = root.querySelector(".quest-message-text");
    const title = root.querySelector(".quest-reward-title");
    const description = root.querySelector(".quest-reward-description");
    const showReward = options.showReward !== undefined
      ? options.showReward !== false
      : window.state?.gameMode !== "powerChoice";

    title.textContent = options.title || options.name || "QUEST REWARD";
    description.textContent = options.description || "Quest completed";
    root.style.setProperty(
      "--quest-reward-color",
      options.color || options.accentColor || "var(--guesser-color, #58c9ff)"
    );
    root.style.setProperty(
      "--quest-message-color",
      options.messageColor || "var(--guesser-color, #58c9ff)"
    );

    window.__lastQuestCompletionAnimationAt = Date.now();
    window.__questCompletionAnimationActive = true;
    root.setAttribute("aria-hidden", "false");
    void root.offsetWidth;
    root.classList.add("is-active");

    activePromise = (async () => {
      try {
        await typeFromThinAir(typed, options.text || "Quest completed");
        await wait(TYPE_HOLD);

        root.classList.add("whoosh");
        await wait(WHOOSH_TO_REWARD);

        if (showReward) {
          root.classList.add("reveal");
          await wait(REWARD_HOLD);
        } else {
          // Let the whoosh finish before the actual Power Choice cards open.
          await wait(TRANSITION_SETTLE);
        }

        root.classList.add("fade-out");
        await wait(FADE_TIME);
      } finally {
        resetOverlay(root);
        window.__questCompletionAnimationActive = false;
      }
    })();

    window.__questCompletionAnimationPromise = activePromise;
    activePromise = activePromise.finally(() => {
      activePromise = null;
      window.__questCompletionAnimationPromise = null;
    });
    window.__questCompletionAnimationPromise = activePromise;
    return activePromise;
  }

  window.playQuestCompletion = playQuestCompletion;
  window.testQuestCompletionAnimation = function () {
    return playQuestCompletion({
      text: "Quest completed",
      title: "SHARP MIND",
      description: "Guesser Quest completed",
      color: "var(--guesser-color, #58c9ff)",
      showReward: true
    });
  };
})();
