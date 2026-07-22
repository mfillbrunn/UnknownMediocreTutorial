// client/big-announce.js — a centered, ceremonial popup used for
// round-start (role + goal) and secret-found moments. Auto-dismisses, or
// dismisses early on click.

window.showBigAnnounce = function ({
  icon = "",
  title = "",
  sub = "",
  powerGroups = null,
  roleClass = "",
  duration = 2400,
  // Compact: a small top-of-screen banner instead of the full ceremonial
  // centered/backdrop-dimmed card -- for frequent, low-stakes messages
  // (e.g. a rejected secret) where blocking the whole board would be
  // overkill.
  compact = false,
  // Persistent: no auto-dismiss timer at all -- only a click closes it.
  // Used for no-time-limit games' round-start announcement, where there's
  // no reason to rush a player through reading their powers before it
  // vanishes on its own.
  persistent = false
} = {}) {
  const el = document.getElementById("bigAnnouncePopup");
  if (!el) return;

  clearTimeout(el.__dismissTimer);

  el.className = `big-announce ${compact ? "compact" : ""} ${roleClass}`.trim();
  el.querySelector(".big-announce-icon").textContent = icon;
  el.querySelector(".big-announce-title").textContent = title;

  const tapHintEl = el.querySelector(".big-announce-tap-hint");
  if (tapHintEl) tapHintEl.hidden = !persistent;

  // sub can be a single string or an array of strings, each rendered on
  // its own line (e.g. Field Report: the revealed-letter line separate
  // from the conditions-met line).
  const subEl = el.querySelector(".big-announce-sub");
  subEl.innerHTML = "";
  (Array.isArray(sub) ? sub : [sub]).filter(Boolean).forEach(line => {
    const lineEl = document.createElement("div");
    lineEl.className = "big-announce-sub-line";
    lineEl.textContent = line;
    subEl.appendChild(lineEl);
  });

  const powersEl = el.querySelector(".big-announce-powers");
  if (powersEl) {
    powersEl.innerHTML = Array.isArray(powerGroups)
      ? powerGroups
          .filter(group => Array.isArray(group.powers) && group.powers.length)
          .map(group => `
            <div class="big-announce-power-group">
              <div class="big-announce-power-group-label ${group.roleClass || ""}">${group.label}</div>
              ${group.powers.map(p => `
                <div class="big-announce-power-row">
                  <span class="big-announce-power-emoji">${p.emoji || ""}</span>
                  <span class="big-announce-power-text"><strong>${p.label}</strong> — ${p.desc || ""}</span>
                </div>
              `).join("")}
            </div>
          `).join("")
      : "";
  }

  // Restart the entrance animation even if it's already showing (e.g. a
  // second round-start fires before the first finished dismissing).
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  el.setAttribute("aria-hidden", "false");

  const dismiss = () => {
    el.classList.remove("show");
    el.setAttribute("aria-hidden", "true");
    el.removeEventListener("click", dismiss);
  };

  el.addEventListener("click", dismiss);
  el.__dismissTimer = persistent ? null : setTimeout(dismiss, duration);
};
