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

      // Screen filtering
      if (msg.screen === "setter" && role !== state.setter) continue;
      if (msg.screen === "guesser" && role !== state.guesser) continue;

      messages.push(msg);
    }
  }

  return messages.sort(
    (a, b) => (a.priority ?? 50) - (b.priority ?? 50)
  );
}

};
