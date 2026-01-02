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

      if (Array.isArray(result)) messages.push(...result);
      else messages.push(result);
    }

    return messages
      .filter(Boolean)
      .sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
  }
};
