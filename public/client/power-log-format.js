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
    letterLockout(emissions) {
      const p = findEmission(emissions, "powerUsed")?.payload;
      return p?.letter ? `banned letter ${p.letter}` : null;
    },
    hideTile(emissions) {
      const p = findEmission(emissions, "powerUsed")?.payload;
      return p?.letter ? `reset letter ${p.letter}` : null;
    }
  };

  function formatPowerEvent(evt) {
    // USE_QUEST isn't a power in POWER_METADATA (it's the guesser's
    // standing quest badge, not a drafted power) -- questServer.js pushes
    // this shape directly on completion, so it's formatted here instead
    // of falling through to the metadata lookup below.
    if (evt.id === "quest") {
      return { id: "quest", emoji: "", label: "Quest", desc: "", detail: null, text: "Quest completed", actorRole: evt.actorRole || null };
    }

    const variant = window.state?.powers?.[evt.id]?.mode || null;
    const meta = window.getPowerMeta ? window.getPowerMeta(evt.id, variant) : window.POWER_METADATA?.[evt.id];
    const label = meta?.label || evt.id;
    const emoji = meta?.emoji || "";
    const desc = meta?.desc || "";
    // DETAIL_FORMATTERS carry a genuinely dynamic result (which letter got
    // revealed, which one got banned) worth stating -- prefer those. Most
    // server-side toasts, though, just restate that the power fired (e.g.
    // "Nonsense power activated - this round, the guess does not have to
    // make sense.", right after a label that already says "Silly Word"),
    // which read as saying the same thing twice. The power's own static
    // desc already explains what it does without that redundancy, so it's
    // a better fallback than the toast text -- the toast is now only used
    // as a last resort, for the rare power with neither.
    const detail =
      DETAIL_FORMATTERS[evt.id]?.(evt.emissions) ||
      desc ||
      lastToastText(evt.emissions) ||
      null;
    const text = detail ? `${label}: ${detail}` : label;
    return { id: evt.id, emoji, label, desc, detail, text, actorRole: evt.actorRole || null };
  }

  window.formatPowerEvent = formatPowerEvent;
})();
