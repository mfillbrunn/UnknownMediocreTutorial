// client/power-log-format.js — turns a server "power event" ({id, actorRole,
// emissions}) into human-readable text for the action log and popups.
// Reuses window.POWER_METADATA (already used by the badge/summary code) plus
// whatever each power already broadcast publicly (its "emissions").

(function () {
  function findEmission(emissions, eventName) {
    return (emissions || []).find(e => e.event === eventName);
  }

  function lastToastText(emissions) {
    const toasts = (emissions || []).filter(e => e.event === "toast");
    if (!toasts.length) return null;
    const t = toasts[toasts.length - 1].payload;
    return typeof t === "string" ? t : (t?.text || null);
  }

  // Powers whose public broadcast already carries a specific, useful result.
  // Anything not listed here falls back to the last "toast" text (if any),
  // then to a plain "<label> used" line.
  const DETAIL_FORMATTERS = {
    revealGreen(emissions) {
      const p = findEmission(emissions, "powerUsed")?.payload;
      return p && typeof p.pos === "number" && p.letter
        ? `position ${p.pos + 1} = ${p.letter}`
        : null;
    },
    revealLetter(emissions) {
      const p = findEmission(emissions, "rareLetterReveal")?.payload;
      return p && typeof p.index === "number" && p.letter
        ? `position ${p.index + 1} = ${p.letter}`
        : null;
    },
    revealHistory(emissions) {
      const p = findEmission(emissions, "revealOldSecret")?.payload;
      return p?.secret ? `revealed secret: ${p.secret}` : null;
    },
    vowelRefresh(emissions) {
      const p = findEmission(emissions, "vowelRefreshInfo")?.payload;
      return p?.vowels?.length ? `reset vowels: ${p.vowels.join(", ")}` : null;
    },
    fieldReport(emissions) {
      const p = findEmission(emissions, "fieldReportResult")?.payload;
      if (!p) return null;
      if (p.reward === "green") return `${p.metCount}/3 met — revealed ${p.letter} in position ${p.index + 1}`;
      if (p.reward === "yellow") return `${p.metCount}/3 met — ${p.letter} is in the secret`;
      if (p.reward === "none-left") return `${p.metCount}/3 met — nothing left to reveal`;
      return `${p.metCount}/3 met — no reveal`;
    },
    hideTile(emissions) {
      const p = findEmission(emissions, "powerUsed")?.payload;
      return p?.letter ? `reset letter ${p.letter}` : null;
    }
  };
  function formatPowerEvent(evt) {
  if (evt.id === "quest") {
    // Two different rewards share this one power id (see questServer.js's
    // pushQuestLogEvent) -- an early claim (yellow, quest not actually
    // finished) reads very differently from a real completion (green), so
    // the emitted event name decides which text this line gets instead of
    // both collapsing into one generic "Quest completed" regardless of
    // which one actually happened.
    const earlyClaim = findEmission(evt.emissions, "questEarlyClaim")?.payload;
    if (earlyClaim) {
      const letter = earlyClaim.letter ? earlyClaim.letter.toUpperCase() : null;
      const detail = letter
        ? `claimed early — ${letter} is somewhere in the secret`
        : "claimed early — nothing new was left to reveal";
      return {
        id: "quest",
        emoji: "",
        label: "Quest",
        desc: "",
        opponentDesc: "The Guesser claimed their Quest early.",
        detail,
        ownText: `Quest ${detail}`,
        opponentText: `Guesser's Quest ${detail}`,
        text: `Quest ${detail}`,
        actorRole: "guesser"
      };
    }

    const completed = findEmission(evt.emissions, "questCompleted")?.payload;
    const letter = completed?.letter ? completed.letter.toUpperCase() : null;
    const detail = letter && Number.isInteger(completed.index)
      ? `revealed ${letter} in position ${completed.index + 1}`
      : null;

    return {
      id: "quest",
      emoji: "",
      label: "Quest",
      desc: "",
      opponentDesc:
        "The Guesser completed their Quest.",
      detail,
      ownText: detail ? `Quest completed — ${detail}` : "Quest completed",
      opponentText: detail
        ? `Guesser completed their Quest — ${detail}`
        : "Guesser completed their Quest",
      text: detail ? `Quest completed — ${detail}` : "Quest completed",
      actorRole: "guesser"
    };
  }

  // Setter Quest reward -- not a real drafted power (no POWER_METADATA
  // entry), same reasoning as the guesser "quest" branch above.
  if (evt.id === "setterQuest") {
    const p = findEmission(evt.emissions, "powerUsed")?.payload;
    const letter = p?.letter || null;
    return {
      id: "setterQuest",
      emoji: "🎯",
      label: "Setter Quest",
      desc: "",
      opponentDesc: "The Secretkeeper used their Setter Quest reward.",
      detail: letter ? `reset letter ${letter}` : null,
      ownText: letter ? `Setter Quest: reset letter ${letter}` : "Setter Quest reward used",
      opponentText: letter
        ? `Setter Quest: Secretkeeper reset letter ${letter}`
        : "Secretkeeper used their Setter Quest reward",
      text: letter ? `Setter Quest: reset letter ${letter}` : "Setter Quest reward used",
      actorRole: "setter"
    };
  }

  const variant =
    window.state
      ?.powers
      ?.[evt.id]
      ?.mode || null;

  const meta =
    window.getPowerMeta
      ? window.getPowerMeta(
          evt.id,
          variant
        )
      : window.POWER_METADATA
          ?.[evt.id];

  const label =
    meta?.label || evt.id;

  const emoji =
    meta?.emoji || "";

  const desc =
    meta?.desc || "";

  const opponentDesc =
    meta?.opponentDesc ||
    meta?.short ||
    desc;

  const dynamicDetail =
    DETAIL_FORMATTERS[evt.id]
      ?.(evt.emissions) ||
    null;

  const fallbackDetail =
    lastToastText(evt.emissions);

  const ownDetail =
    dynamicDetail ||
    desc ||
    fallbackDetail ||
    null;

  const ownText =
    ownDetail
      ? `${label}: ${ownDetail}`
      : label;

const opponentText =
  dynamicDetail
    ? `${label}: ${opponentDesc} — ${dynamicDetail}`
    : `${label}: ${opponentDesc}`;

  return {
    id: evt.id,
    emoji,
    label,
    desc,
    opponentDesc,
    detail: dynamicDetail,
    ownText,
    opponentText,
    text: ownText,
    actorRole:
      evt.actorRole || null
  };
}

  window.formatPowerEvent = formatPowerEvent;
})();
