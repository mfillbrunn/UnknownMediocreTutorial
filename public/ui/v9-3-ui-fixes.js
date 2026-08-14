(() => {
  "use strict";

  const byId = id => document.getElementById(id);
  const meterStates = new Map();
  const observed = new WeakSet();

  let uiFrame = 0;
  let installTimer = null;

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function bonusHint(state = window.state) {
    const charge = state?.powers?.spyCharge;
    const hint = charge?.hint;

    if (
      window.myRole !== "setter" ||
      !charge?.enabled ||
      !hint?.letter ||
      !Number.isInteger(hint.position)
    ) {
      return null;
    }

    return {
      letter: String(hint.letter).toUpperCase(),
      position: hint.position
    };
  }

  function bonusBoxes(hint) {
    return Array.from({ length: 5 }, (_, index) => {
      const active = index === hint.position;
      return (
        `<span class="setter-bonus-box-v9 setter-bonus-box-v93${active ? " is-target" : ""}">` +
        `${active ? hint.letter : ""}` +
        `</span>`
      );
    }).join("");
  }

  function renderInlineBonus(state = window.state) {
    const hint = bonusHint(state);
    const target = byId("setterBonusTargetV9");
    const meta = byId("setterDecisionMeta");
    const remaining = byId("SetterRemainingBox");

    if (!target) return;

    const show = !!hint;
    target.classList.toggle("hidden", !show);

    if (!show) {
      target.classList.remove("setter-bonus-inline-v93");
      return;
    }

    if (meta && target.parentElement !== meta) {
      meta.appendChild(target);
    } else if (
      meta &&
      remaining?.parentElement === meta &&
      target.previousElementSibling !== remaining
    ) {
      remaining.insertAdjacentElement("afterend", target);
    }

    const key = `${hint.letter}:${hint.position}`;
    const ready =
      target.dataset.inlineBonusV93 === key &&
      !!target.querySelector(".setter-bonus-label-v93");

    if (!ready) {
      target.dataset.inlineBonusV93 = key;
      /* Keeps V9.2's own normalizer from rewriting this compact version. */
      target.dataset.compactBonusV92 = key;
      target.classList.add("setter-bonus-inline-v93");
      target.innerHTML = `
        <span class="setter-bonus-code-v92 setter-bonus-label-v93">
          <span class="setter-bonus-plus-star-v93" aria-hidden="true">+★</span>
          <span>Bonus star</span>
        </span>
        <span class="setter-bonus-boxes-v9 setter-bonus-boxes-v93" aria-hidden="true">
          ${bonusBoxes(hint)}
        </span>
      `;
      target.setAttribute(
        "aria-label",
        `Bonus star: put ${hint.letter} in box ${hint.position + 1}`
      );
    }
  }

  function syncBonusDraftTile(state = window.state) {
    const hint = bonusHint(state);

    document
      .querySelectorAll("#draftSetter .bonus-target-met-v93")
      .forEach(tile => tile.classList.remove("bonus-target-met-v93"));

    if (!hint) return;

    const rows = [...document.querySelectorAll(
      "#draftSetter .history-row.setter-draft, #draftSetter .history-row.ghost-secret"
    )].filter(row => row.style.display !== "none");

    const row = rows.at(-1);
    if (!row) return;

    const tiles = row.__tiles || row.querySelectorAll(":scope > .history-tile");
    const tile = tiles?.[hint.position];
    if (!tile) return;

    const actual = String(tile.textContent || "").trim().toUpperCase();
    const isTypedDraft = row.classList.contains("setter-draft");

    tile.classList.toggle(
      "bonus-target-met-v93",
      isTypedDraft && actual === hint.letter
    );
  }

  function formatFieldCondition(condition) {
    if (typeof window.formatFieldReportCondition === "function") {
      return window.formatFieldReportCondition(condition);
    }

    const letter = String(condition?.letter || "").toUpperCase();
    const count = Number(condition?.count) || 0;

    switch (condition?.type) {
      case "startsWith":
        return `Starts with ${letter}`;
      case "endsWith":
        return `Ends with ${letter}`;
      case "doubleLetter":
        return `Uses a double ${letter}`;
      case "minVowels":
        return `At least ${count} vowel${count === 1 ? "" : "s"}`;
      case "maxVowels":
        return `At most ${count} vowel${count === 1 ? "" : "s"}`;
      case "firstLastSame":
        return "First and last letters match";
      case "palindrome":
        return "Reads the same both ways";
      default:
        return "Matches the rule";
    }
  }

  function questInstruction(state = window.state) {
    const quest = state?.powers?.quest;
    const type = quest?.type;
    if (!type) return "";

    const snapshot = window.getQuestChargeV9?.(state);
    const rare = Array.isArray(quest.rareLetters) && quest.rareLetters.length
      ? quest.rareLetters.map(value => String(value).toUpperCase())
      : "QJXZWKV".split("");

    switch (type) {
      case "FIELDREPORT": {
        const conditions = Array.isArray(quest.conditions) ? quest.conditions : [];
        const details = conditions.length
          ? conditions.map(formatFieldCondition).join(" · ")
          : "Match the three Field Report rules";
        return `Quest: Conditions → ${details}`;
      }
      case "RARE":
        return `Quest: Use ${snapshot?.max || 6} different rare letters — ${rare.join(" ")}`;
      case "CHAIN": {
        const needed = snapshot?.nextLetter || "";
        return needed
          ? `Quest: Start this word with ${needed}`
          : "Quest: Submit a word to start the chain";
      }
      case "ROW":
        return `Quest: Complete the ${snapshot?.row?.label || "closest"} keyboard row`;
      case "ALPHA":
        return "Quest: Put the letters in alphabetical or reverse order";
      case "DOUBLES":
        return "Quest: Use a new doubled letter";
      case "HARDMODE":
        return "Quest: Keep every green and yellow clue";
      case "ALTERNATING":
        return "Quest: Alternate consonants and vowels";
      case "BOOKENDS":
        return "Quest: Use the same first and last letter";
      case "HALF_AM":
        return "Quest: Use only letters A through P";
      case "HALF_NZ":
        return "Quest: Use only letters K through Z";
      case "VOWELSHORTAGE":
        return "Quest: Use exactly one vowel";
      default:
        return `Quest: ${window.QUEST_METADATA?.[type]?.desc || "Complete the condition"}`;
    }
  }

  function renderQuestInstruction(state = window.state) {
    const requirement = byId("guesserQuestRequirement");
    if (!requirement || requirement.classList.contains("hidden")) return;

    const instruction = questInstruction(state);
    if (!instruction) return;

    if (
      requirement.dataset.instructionV93 === instruction &&
      requirement.querySelector(":scope > .quest-requirement-inline-v93")
    ) {
      return;
    }

    /* Preserve V9.2's compatibility key so its observer does not overwrite us. */
    const compactKey = requirement.dataset.compactInstructionV92 || instruction;

    requirement.dataset.instructionV93 = instruction;
    requirement.replaceChildren();

    const line = document.createElement("div");
    line.className = "quest-requirement-inline-v92 quest-requirement-inline-v93";
    line.textContent = instruction;
    requirement.appendChild(line);

    requirement.dataset.compactInstructionV92 = compactKey;
  }

  function toneFor(role, value, max) {
    if (role === "setter") {
      if (value >= 12) return "purple";
      if (value >= 8) return "cyan";
      if (value >= 5) return "yellow";
      return "blue";
    }

    if (max > 0 && value >= max) return "green";
    if (max > 1 && value >= max - 1) return "yellow";
    return "blue";
  }

  function clearMeterTimers(state) {
    for (const timer of state.timers || []) clearTimeout(timer);
    state.timers = [];
  }

  function ensureToastSegments(toast, role, max) {
    toast.classList.add("collapsed-charge-meter-v92", "collapsed-charge-meter-v93");
    toast.style.setProperty("--collapsed-meter-segments", String(max));

    let track = toast.querySelector(".collapsed-meter-track-v92");
    let value = toast.querySelector(".collapsed-meter-value-v92");
    let delta = toast.querySelector(".collapsed-charge-toast-delta");

    if (!track) {
      track = document.createElement("span");
      track.className = "collapsed-meter-track-v92";
      track.setAttribute("aria-hidden", "true");
      toast.prepend(track);
    }

    if (!value) {
      value = document.createElement("span");
      value.className = "collapsed-meter-value-v92";
      toast.appendChild(value);
    }

    if (!delta) {
      delta = document.createElement("span");
      delta.className = "collapsed-charge-toast-delta";
      toast.appendChild(delta);
    }

    if (track.children.length !== max) {
      track.replaceChildren(
        ...Array.from({ length: max }, (_, index) => {
          const segment = document.createElement("span");
          segment.className = "collapsed-meter-segment-v92";
          if (role === "setter" && [4, 7, 11].includes(index)) {
            segment.classList.add("is-milestone");
          }
          return segment;
        })
      );
    }

    return { track, value, delta };
  }

  function paintCollapsedMeter(toast, role, value, max, justFilledIndex = -1) {
    const parts = ensureToastSegments(toast, role, max);
    const tone = toneFor(role, value, max);

    toast.dataset.tone = tone;
    toast.classList.add("show", "v93-meter-filling");

    [...parts.track.children].forEach((segment, index) => {
      segment.classList.toggle("is-filled", index < value);
      segment.classList.toggle("just-filled-v93", index === justFilledIndex);
    });

    parts.value.textContent = `${value}/${max}`;
    toast.setAttribute(
      "aria-label",
      `${role === "setter" ? "Spy charge" : "Quest charge"}: ${value} of ${max}`
    );
  }

  function installAnimatedCollapsedMeter() {
    const original = window.showCollapsedChargeToast;
    if (typeof original !== "function" || original.__v93Animated) return false;

    const wrapped = function (role, detail = {}) {
      const max = Math.max(1, Number(detail.max) || (role === "setter" ? 12 : 1));
      const rawValue = clamp(Number(detail.value) || 0, 0, max);
      const delta = clamp(Number(detail.delta) || 0, 0, max);
      const current = meterStates.get(role);

      if (
        role === "setter" &&
        !detail.__v93Award &&
        current &&
        rawValue <= current.final
      ) {
        current.toast?.classList.add("show");
        return current.toast;
      }

      const start = role === "setter"
        ? rawValue
        : clamp(rawValue - delta, 0, max);

      const final = role === "setter"
        ? clamp(rawValue + delta, 0, max)
        : rawValue;

      if (
        current &&
        current.running &&
        current.start === start &&
        current.final === final
      ) {
        return current.toast;
      }

      if (current) clearMeterTimers(current);

      const toast = original(role, {
        ...detail,
        value: start,
        delta: 0,
        tone: toneFor(role, start, max)
      });

      if (!toast) return null;

      const state = {
        role,
        toast,
        start,
        final,
        max,
        running: final > start,
        timers: []
      };

      meterStates.set(role, state);
      paintCollapsedMeter(toast, role, start, max);

      const deltaNode = toast.querySelector(".collapsed-charge-toast-delta");
      if (deltaNode) {
        deltaNode.textContent = final > start ? `+${final - start}` : "";
        deltaNode.classList.toggle("hidden", final <= start);
      }

      for (let next = start + 1; next <= final; next++) {
        const step = next - start - 1;
        const delay = role === "setter"
          ? 700 + step * 120
          : 480 + step * 440;

        state.timers.push(setTimeout(() => {
          paintCollapsedMeter(toast, role, next, max, next - 1);

          const filled = toast.querySelectorAll(".collapsed-meter-segment-v92")[next - 1];
          if (filled) {
            setTimeout(() => filled.classList.remove("just-filled-v93"), 520);
          }

          if (next === final) {
            state.running = false;
            toast.classList.remove("v93-meter-filling");
          }
        }, delay));
      }

      return toast;
    };

    wrapped.__v93Animated = true;
    wrapped.__v93Original = original;
    window.showCollapsedChargeToast = wrapped;
    return true;
  }

  function installSetterAwardBridge() {
    if (
      typeof socket === "undefined" ||
      !socket ||
      typeof socket.on !== "function" ||
      socket.__v93SetterAwardBridge
    ) {
      return;
    }

    socket.__v93SetterAwardBridge = true;
    socket.on("spyChargeAward", payload => {
      const collapsed = byId("setterScreen")?.classList.contains(
        "setter-sidebar-collapsed"
      );
      if (!collapsed) return;

      const before = clamp(Number(payload?.before) || 0, 0, 12);
      const delta = Math.max(
        0,
        (Number(payload?.appliedBaseStars) || 0) +
        (Number(payload?.appliedBonusStars) || 0)
      );

      window.showCollapsedChargeToast?.("setter", {
        value: before,
        max: 12,
        delta,
        __v93Award: true
      });
    });
  }

  function updateUi() {
    renderInlineBonus(window.state);
    syncBonusDraftTile(window.state);
    renderQuestInstruction(window.state);
    installAnimatedCollapsedMeter();
    installSetterAwardBridge();
  }

  function scheduleUi() {
    if (uiFrame) return;
    uiFrame = requestAnimationFrame(() => {
      uiFrame = 0;
      updateUi();
    });
  }

  function wrapUpdateFunction(name, marker) {
    const original = window[name];
    if (typeof original !== "function" || original[marker]) return false;

    const wrapped = function (...args) {
      const result = original.apply(this, args);
      scheduleUi();
      return result;
    };

    wrapped[marker] = true;
    window[name] = wrapped;
    return true;
  }

  function observeElement(element) {
    if (!element || observed.has(element)) return;
    observed.add(element);

    const observer = new MutationObserver(scheduleUi);
    observer.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden"]
    });
  }

  function installObservers() {
    for (const id of [
      "setterDecisionMeta",
      "SetterRemainingBox",
      "setterBonusTargetV9",
      "draftSetter",
      "guesserQuestRequirement",
      "draftGuesser"
    ]) {
      observeElement(byId(id));
    }
  }

  function install() {
    installAnimatedCollapsedMeter();
    installSetterAwardBridge();
    wrapUpdateFunction("updateSpyChargeUI", "__v93UiWrapped");
    wrapUpdateFunction("updateQuestChargeV9", "__v93UiWrapped");
    wrapUpdateFunction("updateQuestBadge", "__v93UiWrapped");
    installObservers();
    scheduleUi();
  }

  function init() {
    install();

    let attempts = 0;
    installTimer = setInterval(() => {
      attempts += 1;
      install();
      if (attempts >= 80) {
        clearInterval(installTimer);
        installTimer = null;
      }
    }, 125);

    window.addEventListener("resize", scheduleUi, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
