// client/dev-daily-reset.js — Developer tool: wipe everyone's Daily
// Challenge record for today and reroll the day's config (see
// server/utils/dailySeedOverride.js), so testing a different playMode/
// quest/reward schedule doesn't mean waiting for the calendar to roll
// over. Destructive and global -- confirmed before firing, same pattern
// my-games.js's Abandon uses.

document.getElementById("devResetDailyBtn")?.addEventListener("click", () => {
  if (!window.currentUser) return toast("Please log in first");

  const sure = confirm(
    "Reset today's Daily Challenge for EVERYONE and generate a new one? " +
    "This deletes every player's result for today and can't be undone."
  );
  if (!sure) return;

  const btn = document.getElementById("devResetDailyBtn");
  if (btn) btn.disabled = true;

  socket.emit(
    "resetDailyChallenge",
    { userId: window.currentUser.id },
    (res) => {
      if (btn) btn.disabled = false;

      if (!res?.ok) {
        toast(res?.error || "Could not reset today's Daily Challenge");
        return;
      }

      toast(`Daily Challenge for ${res.date} reset and rerandomized`);
    }
  );
});
