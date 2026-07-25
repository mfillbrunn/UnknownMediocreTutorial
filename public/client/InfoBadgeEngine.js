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
    const detailId = role === "setter" ? "SetterInfoBadgeDetail" : "GuesserInfoBadgeDetail";
    const detail = $(detailId);

    if (!badge) return;

    const messages = this.collect(state, role);
    this._lastMessages[role] = messages;

    if (!messages.length) {
      badge.classList.remove("show");
      badge.innerHTML = "";
      if (detail) { detail.hidden = true; detail.innerHTML = ""; }
      return;
    }

    const renderItem = (m, i) => `
      <span class="badge-item${m.id ? ` badge-${m.id}` : ""}${m.clickable ? " badge-clickable" : ""}" data-badge-index="${i}" style="color:${m.color ?? "var(--role-accent)"}">
        ${m.emoji ? `${m.emoji} ` : ""}${m.text}
      </span>
    `;

    // The quest is always-on and meant to stand out, but it sorts into the
    // same wrapping row as however many powers happen to be active right
    // now (up to MAX_POWERS_PER_ROLE = 3) -- with 3 powers up, that row
    // gets very wide/wraps across lines and the quest just reads as one
    // more item buried in the crowd. Pull it onto its own row instead so
    // it never has to compete with the powers for space.
    const questIndex = messages.findIndex(m => m.id === "quest");
    const questHtml = questIndex === -1 ? "" : renderItem(messages[questIndex], questIndex);
    const powerHtml = messages
      .map((m, i) => (i === questIndex ? null : renderItem(m, i)))
      .filter(Boolean)
      .join(`<span class="badge-sep">·</span>`);

    badge.innerHTML = [questHtml, powerHtml]
      .filter(Boolean)
      .join(`<span class="badge-row-break"></span>`);

    badge.classList.add("show");

    // A message can carry extra info that doesn't fit the one-line badge
    // (e.g. a quest's randomized per-match conditions) -- shown as its own
    // small line right underneath, only for the messages that actually
    // need it (most don't set subtext at all).
    if (detail) {
      const subtexts = messages.map(m => m.subtext).filter(Boolean);
      if (subtexts.length) {
        detail.innerHTML = subtexts
          .map(s => `<span class="info-badge-detail-item">${s}</span>`)
          .join(`<span class="badge-sep">·</span>`);
        detail.hidden = false;
      } else {
        detail.innerHTML = "";
        detail.hidden = true;
      }
    }

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
