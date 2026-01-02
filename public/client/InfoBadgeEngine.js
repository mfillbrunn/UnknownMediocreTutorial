window.InfoBadgeEngine = {
  collectors: [],

  register(fn) {
    this.collectors.push(fn);
  },

  collect(state, role) {
    const messages = [];

    for (const fn of this.collectors) {
      const result = fn(state, role);
      if (!result) continue;

      const arr = Array.isArray(result) ? result : [result];

      for (const msg of arr) {
        if (!msg) continue;

        if (msg.screen === "setter" && role !== state.setter) continue;
        if (msg.screen === "guesser" && role !== state.guesser) continue;

        messages.push(msg);
      }
    }

    return messages.sort(
      (a, b) => (a.priority ?? 50) - (b.priority ?? 50)
    );
  },

  render(state, role) {
    const badge =
      role === state.setter
        ? $("SetterInfoBadge")
        : $("GuesserInfoBadge");

    if (!badge) return;

    const messages = this.collect(state, role);

    if (!messages.length) {
      badge.classList.remove("show");
      badge.innerHTML = "";
      return;
    }

    const primary = messages.filter(m => m.row === "primary");
    const secondary = messages.filter(m => m.row !== "primary");

    badge.innerHTML = `
      ${primary.length ? `
        <div class="badge-row badge-row-primary">
          ${primary.map(m => `
            <div class="badge-line">
              ${m.emoji ? `${m.emoji} ` : ""}${m.text}
            </div>
          `).join("")}
        </div>
      ` : ""}

      ${secondary.length ? `
        <div class="badge-row badge-row-secondary">
          ${secondary.map(m => {
            // --- Special case: remaining words comparison ---
            if ("keep" in m || "new" in m) {
              return `
                <span class="badge-item ${m.compare === "old" ? "better" : ""}">
                  Keep: ${m.keep ?? "-"}
                </span>
                <span class="badge-sep">•</span>
                <span class="badge-item ${m.compare === "new" ? "better" : ""}">
                  New: ${m.new ?? "-"}
                </span>
              `;
            }

            // --- Default power badge ---
            return `
              <span class="badge-item">
                ${m.emoji ? `${m.emoji} ` : ""}${m.text}
              </span>
            `;
          }).join('<span class="badge-sep">•</span>')}
        </div>
      ` : ""}
    `;

    badge.classList.add("show");
  }
};
