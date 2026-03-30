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

        if (msg.screen === "setter" && role !== "setter") continue;
        if (msg.screen === "guesser" && role !== "guesser") continue;

        messages.push(msg);
      }
    }

    return messages.sort(
      (a, b) => (a.priority ?? 50) - (b.priority ?? 50)
    );
  },

  render(state, role) {
    const badge =
      role === "setter"
        ? $("SetterInfoBadge")
        : $("GuesserInfoBadge");

    if (!badge) return;

    const messages = this.collect(state, role);

    if (!messages.length) {
      badge.classList.remove("show");
      badge.innerHTML = "";
      return;
    }

    badge.innerHTML = messages
      .map(m => `
        <span class="badge-item" style="color:${m.color ?? "var(--role-accent)"}">
          ${m.emoji ? `${m.emoji} ` : ""}${m.text}
        </span>
      `)
      .join(`<span class="badge-sep">·</span>`);

    badge.classList.add("show");
  }
};
