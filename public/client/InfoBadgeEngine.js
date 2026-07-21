window.InfoBadgeEngine = {
  collectors: [],
  // Messages collected on the most recent render, keyed by role -- the
  // delegated click listener below looks a badge item's onClick up here
  // by index rather than attaching a fresh handler to each <span> every
  // render (badge.innerHTML gets fully rebuilt on every render() call, so
  // any listener bound directly to a span would be destroyed with it).
  _lastMessages: { setter: [], guesser: [] },
  _delegatedBound: { setter: false, guesser: false },

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
    const badgeId = role === "setter" ? "SetterInfoBadge" : "GuesserInfoBadge";
    const badge = $(badgeId);

    if (!badge) return;

    const messages = this.collect(state, role);
    this._lastMessages[role] = messages;

    if (!messages.length) {
      badge.classList.remove("show");
      badge.innerHTML = "";
      return;
    }

    badge.innerHTML = messages
      .map((m, i) => `
        <span class="badge-item${m.clickable ? " badge-clickable" : ""}" data-badge-index="${i}" style="color:${m.color ?? "var(--role-accent)"}">
          ${m.emoji ? `${m.emoji} ` : ""}${m.text}
        </span>
      `)
      .join(`<span class="badge-sep">·</span>`);

    badge.classList.add("show");

    if (!this._delegatedBound[role]) {
      this._delegatedBound[role] = true;
      badge.addEventListener("click", (e) => {
        const item = e.target.closest(".badge-item[data-badge-index]");
        if (!item) return;
        const msg = this._lastMessages[role]?.[Number(item.dataset.badgeIndex)];
        msg?.onClick?.();
      });
    }
  }
};
