(() => {
  "use strict";

  const LOG_IDS = [
    "actionLogSetter",
    "actionLogGuesser"
  ];

  let scheduled = false;

  function normalText(element) {
    return String(element?.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isQuestCompletion(element) {
    const text = normalText(element);

    return (
      /\bquest\b/i.test(text) &&
      /\bcomplete(?:d)?\b/i.test(text)
    );
  }

  function dedupeContainer(container) {
    if (!container) return;

    const rows = [
      ...container.querySelectorAll(
        ".log-entry.log-power"
      )
    ];

    let foundCompletion = false;

    for (const row of rows) {
      if (!isQuestCompletion(row)) {
        continue;
      }

      if (!foundCompletion) {
        foundCompletion = true;
        continue;
      }

      row.remove();
    }

    /*
     * action-log.js uses this count to decide whether a newly added line
     * should scroll into view. Keep it aligned with the visible rows after
     * removing a duplicate.
     */
    container.dataset.logCount = String(
      container.querySelectorAll(
        ".log-entry"
      ).length
    );
  }

  function dedupeAll() {
    scheduled = false;

    for (const id of LOG_IDS) {
      dedupeContainer(
        document.getElementById(id)
      );
    }
  }

  function scheduleDedupe() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(dedupeAll);
  }

  function init() {
    dedupeAll();

    const observer = new MutationObserver(
      scheduleDedupe
    );

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once: true }
    );
  } else {
    init();
  }
})();
