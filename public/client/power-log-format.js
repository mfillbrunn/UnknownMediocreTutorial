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
    }
  };

  function formatPowerEvent(evt) {
    const meta = window.POWER_METADATA?.[evt.id];
    const label = meta?.label || evt.id;
    const emoji = meta?.emoji || "";
    const desc = meta?.desc || "";
    const detail =
      DETAIL_FORMATTERS[evt.id]?.(evt.emissions) ||
      lastToastText(evt.emissions) ||
      null;
    const text = detail ? `${label}: ${detail}` : `${label} used`;
    return { id: evt.id, emoji, label, desc, detail, text, actorRole: evt.actorRole || null };
  }

  window.formatPowerEvent = formatPowerEvent;
})();
