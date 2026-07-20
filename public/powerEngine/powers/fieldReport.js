// /powers/powers/fieldReport.js

const FIELD_REPORT_CONDITION_LABELS = {
  startsWith: c => `Starts with ${c.letter}`,
  endsWith: c => `Ends with ${c.letter}`,
  doubleLetter: c => `Double letter (${c.letter})`,
  minVowels: c => `At least ${c.count} vowels`,
  maxVowels: c => `At most ${c.count} vowel${c.count === 1 ? "" : "s"}`,
  firstLastSame: () => "First letter = last letter",
  palindrome: () => "Palindrome"
};

function formatFieldReportCondition(c) {
  const fmt = FIELD_REPORT_CONDITION_LABELS[c.type];
  return fmt ? fmt(c) : c.type;
}
// Reused by the Quest system (client/quest.js) for its own FIELDREPORT-
// style objective, same condition vocabulary.
window.formatFieldReportCondition = formatFieldReportCondition;

PowerEngine.register("fieldReport", {
  role: "guesser",
  tooltip: {
    title: window.POWER_METADATA.fieldReport.label,
    desc: window.POWER_METADATA.fieldReport.desc
  },

  renderButton(roomId) {
    const { wrapper, btn } =
      PowerEngine.createPowerButton("fieldReport", window.POWER_METADATA.fieldReport.label);

    this.wrapperEl = wrapper;
    this.buttonEl = btn;
    $("guesserPowerContainer").appendChild(wrapper);

    btn.onclick = () => {
      sendGameAction({ type: "USE_FIELD_REPORT" });
    };
  },

  uiEffects(state, role) {
    const btn = this.buttonEl;
    if (!btn) return;

    if (!state.activePowers || !state.activePowers.includes("fieldReport")) {
      btn.style.display = "none";
      return;
    }
    if (role !== "guesser") {
      btn.style.display = "none";
      return;
    }
    btn.style.display = "";
  }
});

// --------------------------------------------------
// Field Report — show the 3 revealed conditions once activated
// --------------------------------------------------

InfoBadgeEngine.register((state, role) => {
  if (!state.powers?.fieldReportActive) return null;
  const conditions = state.powers?.fieldReportConditions;
  if (!Array.isArray(conditions) || !conditions.length) return null;

  const meta = POWER_METADATA.fieldReport;
  const text = conditions.map(formatFieldReportCondition).join(" • ");

  return {
    id: "fieldReport",
    emoji: meta.emoji ?? "📋",
    text: `${meta.label} (next guess): ${text}`,
    color: meta.color,
    priority: 15,
    screen: "both",
    details: "Meet 2 of 3 for a free yellow letter, all 3 for a free green letter."
  };
});
