///ROOM ID DISPLAY
(() => {
  const syncHeaderRoomCodes = () => {
    const src = document.getElementById("roomCodeLabel");
    if (!src) return;

    document
      .querySelectorAll(".header-room-code")
      .forEach(el => {
        el.textContent = src.textContent;
      });
  };

  const src = document.getElementById("roomCodeLabel");
  if (!src) return;

  const observer = new MutationObserver(syncHeaderRoomCodes);
  observer.observe(src, { childList: true });

  syncHeaderRoomCodes();
})();
