// client/big-announce.js — a centered, ceremonial popup used for
// round-start (role + goal) and secret-found moments. Auto-dismisses, or
// dismisses early on click.

window.showBigAnnounce = function ({
  icon = "",
  title = "",
  sub = "",
  powerGroups = null,
  roleClass = "",
  duration = 2400
} = {}) {
  const el = document.getElementById("bigAnnouncePopup");
  if (!el) return;

  clearTimeout(el.__dismissTimer);

  el.className = `big-announce ${roleClass}`.trim();
  el.querySelector(".big-announce-icon").textContent = icon;
  el.querySelector(".big-announce-title").textContent = title;

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
  el.__dismissTimer = setTimeout(dismiss, duration);
};
