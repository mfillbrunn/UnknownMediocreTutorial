// public/cuddle/cuddle-engine.js
// Pure client-side rules and persistence for the Cuddle single-player campaign.
(function () {
  "use strict";

  const VERSION = 1;
  const STORAGE_KEY = "vowelPlay.cuddle.v1";
  const THRESHOLDS = Object.freeze([10, 22, 35, 50, 65, 81, 100, 130, 165, 210, 250, 300]);
  const MAX_GUESSES = 6;
  const BASE_HAND_SIZE = 5;
  const BASE_MULLIGANS = 2;
  const BASE_MULLIGAN_SIZE = 3;
  const BASE_GREY_EXCHANGE = 3;
  const ALWAYS_AVAILABLE_VOWELS = Object.freeze(["A", "E", "I", "O", "U"]);
  const VOWELS = new Set(ALWAYS_AVAILABLE_VOWELS);
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  const DEFAULT_UPGRADES = Object.freeze({
    startingHand: 0,
    extraMulligans: 0,
    exchangeReduction: 0,
    mulliganSize: 0,
    yellowPoints: 0,
    earlyRoundPoint: 0,
    questRefreshes: 0,
    questCadence: 0
  });

  function normalizeWords(words) {
    const seen = new Set();
    const normalized = [];
    (words || []).forEach(raw => {
      const word = String(raw || "").trim().toUpperCase();
      if (/^[A-Z]{5}$/.test(word) && !seen.has(word)) {
        seen.add(word);
        normalized.push(word);
      }
    });
    return normalized;
  }

  function shuffle(items, random = Math.random) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function countLetters(text) {
    const counts = Object.create(null);
    String(text || "").split("").forEach(letter => {
      counts[letter] = (counts[letter] || 0) + 1;
    });
    return counts;
  }

  function glyphForLetter(value) {
    const glyph = String(value || "").toUpperCase();
    return glyph === "QU" ? "Q" : glyph;
  }

  function tokensForWord(word) {
    const normalized = String(word || "").toUpperCase();
    return /^[A-Z]+$/.test(normalized) ? normalized.split("") : null;
  }

  function evaluateFeedback(secret, guess) {
    // Reuse the app's universal scorer when it is available; keep a local
    // fallback so the new module remains testable in isolation.
    if (typeof window.scoreGuess === "function") {
      return window.scoreGuess(secret, guess).map(value => (
        value === "🟩" ? "green" : value === "🟨" ? "yellow" : "grey"
      ));
    }
    if (window.CuddleQuestBook?.evaluateFeedback) {
      return window.CuddleQuestBook.evaluateFeedback(secret, guess);
    }
    const result = Array(guess.length).fill("grey");
    const remaining = countLetters(secret);
    for (let i = 0; i < guess.length; i += 1) {
      if (guess[i] === secret[i]) {
        result[i] = "green";
        remaining[guess[i]] -= 1;
      }
    }
    for (let i = 0; i < guess.length; i += 1) {
      if (result[i] === "green") continue;
      if ((remaining[guess[i]] || 0) > 0) {
        result[i] = "yellow";
        remaining[guess[i]] -= 1;
      }
    }
    return result;
  }

  function unique(items) {
    return [...new Set(items)];
  }

  function safeStorage() {
    try {
      return window.localStorage || null;
    } catch {
      return null;
    }
  }

  class CuddleGame {
    constructor(words, options = {}) {
      this.words = normalizeWords(words);
      this.wordSet = new Set(this.words);
      this.random = typeof options.random === "function" ? options.random : Math.random;
      this.storage = options.storage === undefined ? safeStorage() : options.storage;
      this.state = null;
      if (this.words.length < 12) {
        throw new Error("Cuddle needs at least 12 five-letter secret words.");
      }
    }

    static hasSavedRun(storage = safeStorage()) {
      try {
        return Boolean(storage?.getItem(STORAGE_KEY));
      } catch {
        return false;
      }
    }

    static clearSavedRun(storage = safeStorage()) {
      try {
        storage?.removeItem(STORAGE_KEY);
      } catch {
        // Storage is optional; gameplay still works for the current page session.
      }
    }

    static load(words, options = {}) {
      const game = new CuddleGame(words, options);
      let raw = null;
      try {
        raw = game.storage?.getItem(STORAGE_KEY) || null;
      } catch {
        raw = null;
      }
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== VERSION || !parsed.runId) return null;
        game.state = parsed;
        game._hydrateState();
        if (!game._isStateUsable()) return null;
        return game;
      } catch {
        return null;
      }
    }

    _hydrateState() {
      const state = this.state;
      state.upgrades = { ...DEFAULT_UPGRADES, ...(state.upgrades || {}) };
      // The counted hand is now fixed at five. Keep the legacy field so older
      // saves remain readable, but an old starting-hand upgrade has no effect.
      state.upgrades.startingHand = 0;
      const normalizeCards = cards => (Array.isArray(cards) ? cards : [])
        .map(card => (card && typeof card === "object"
          ? { ...card, glyph: glyphForLetter(card.glyph) }
          : null))
        .filter(card => card && /^[A-Z]$/.test(card.glyph));
      state.deck = normalizeCards(state.deck);
      state.discard = normalizeCards(state.discard);
      state.hand = normalizeCards(state.hand);
      state.history = Array.isArray(state.history) ? state.history : [];
      state.draft = [];
      state.usedSecrets = Array.isArray(state.usedSecrets) ? state.usedSecrets : [];
      state.removedLetters = Array.isArray(state.removedLetters) ? state.removedLetters : [];
      state.knownAbsent = Array.isArray(state.knownAbsent) ? state.knownAbsent : [];
      state.knownPresent = Array.isArray(state.knownPresent) ? state.knownPresent : [];
      state.infiniteGlyphs = unique([
        ...ALWAYS_AVAILABLE_VOWELS,
        ...(Array.isArray(state.infiniteGlyphs)
          ? state.infiniteGlyphs.map(glyphForLetter)
          : [])
      ]).sort();
      state.revealedPositions = Array.isArray(state.revealedPositions)
        ? state.revealedPositions.slice(0, 5)
        : Array(5).fill(null);
      while (state.revealedPositions.length < 5) state.revealedPositions.push(null);
      state.questRewardChoices = Array.isArray(state.questRewardChoices) ? state.questRewardChoices : [];
      state.upgradeChoices = Array.isArray(state.upgradeChoices)
        ? state.upgradeChoices.filter(choice => choice?.id !== "startingHand")
        : [];
      state.deferredRewards = Array.isArray(state.deferredRewards) ? state.deferredRewards : [];
      state.buffs = { greyShield: 0, ...(state.buffs || {}) };
      state.serial = Number.isFinite(state.serial) ? state.serial : 0;
      state.maxGuesses = MAX_GUESSES;
      state.milestonesClaimed = Number.isFinite(state.milestonesClaimed) ? state.milestonesClaimed : 0;
      state.pendingMilestones = Number.isFinite(state.pendingMilestones) ? state.pendingMilestones : 0;

      // Migrate older saves by removing finite vowel copies, adding one free
      // unlimited card for every vowel, retaining positive unlimited letters,
      // and enforcing five counted consonant slots.
      this._syncInfiniteCards();
      this._trimHandToLimit();
      if (["playing", "questReward"].includes(state.status)
          && this.getCountedHandSize() < this.getHandLimit()) {
        this.drawToHandLimit();
      }
      if (state.status === "upgrade" && state.upgradeChoices.length < 3) {
        state.upgradeChoices = this._generateUpgradeChoices();
      }
      delete state.feedbackBonusMilestones;
    }

    _isStateUsable() {
      const state = this.state;
      if (!state || state.round < 1 || state.round > THRESHOLDS.length) return false;
      if (!this.wordSet.has(state.secret) && !["upgrade", "won", "lost"].includes(state.status)) return false;
      return true;
    }

    save() {
      if (!this.state) return;
      try {
        this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch {
        // Ignore quota/privacy errors. The active in-memory run remains playable.
      }
    }

    clearSave() {
      CuddleGame.clearSavedRun(this.storage);
    }

    getSnapshot() {
      return this.state ? JSON.parse(JSON.stringify(this.state)) : null;
    }

    startNew() {
      this.state = {
        version: VERSION,
        runId: `${Date.now()}-${Math.floor(this.random() * 1e9)}`,
        serial: 0,
        status: "playing",
        round: 1,
        score: 0,
        roundScore: 0,
        secret: "",
        usedSecrets: [],
        removedLetters: [],
        deck: [],
        discard: [],
        hand: [],
        draft: [],
        history: [],
        guessesUsed: 0,
        maxGuesses: MAX_GUESSES,
        mulligansLeft: BASE_MULLIGANS,
        knownAbsent: [],
        knownPresent: [],
        infiniteGlyphs: [...ALWAYS_AVAILABLE_VOWELS],
        revealedPositions: Array(5).fill(null),
        activeQuest: null,
        questRewardChoices: [],
        questRewardRefreshesLeft: 0,
        pendingRoundEnd: null,
        upgradeChoices: [],
        upgradePhase: null,
        upgradeMilestone: null,
        pendingMilestones: 0,
        milestonesClaimed: 0,
        deferredRewards: [],
        upgrades: { ...DEFAULT_UPGRADES },
        buffs: { greyShield: 0 },
        lastMessage: "Welcome to Cuddle. Build a five-letter word from your hand.",
        lastRoundSummary: null,
        suggestedWord: null,
        failureReason: null
      };
      this._beginRound();
      this.save();
      return this.getSnapshot();
    }

    getTarget(round = this.state?.round || 1) {
      return THRESHOLDS[Math.max(0, Math.min(THRESHOLDS.length - 1, round - 1))];
    }

    getRulesSummary() {
      return {
        handSize: BASE_HAND_SIZE,
        freeVowels: ALWAYS_AVAILABLE_VOWELS.length,
        mulligans: BASE_MULLIGANS + this.state.upgrades.extraMulligans,
        mulliganSize: BASE_MULLIGAN_SIZE + this.state.upgrades.mulliganSize,
        greyExchange: Math.max(1, BASE_GREY_EXCHANGE - this.state.upgrades.exchangeReduction),
        yellowPoints: 2 + this.state.upgrades.yellowPoints,
        earlyPoint: 5 + this.state.upgrades.earlyRoundPoint,
        questCadence: Math.max(1, 3 - this.state.upgrades.questCadence),
        questRefreshes: this.state.upgrades.questRefreshes
      };
    }

    _nextId(prefix = "card") {
      this.state.serial += 1;
      return `${prefix}-${this.state.serial}`;
    }

    _newCard(glyph, source = "deck") {
      return { id: this._nextId(source), glyph, source };
    }

    getHandLimit() {
      return BASE_HAND_SIZE;
    }

    isVowelGlyph(glyph) {
      return VOWELS.has(String(glyph || ""));
    }

    cardCountsTowardHandLimit(card) {
      return Boolean(card && !this.isVowelGlyph(card.glyph));
    }

    getCountedHandSize() {
      return (this.state?.hand || []).filter(card => this.cardCountsTowardHandLimit(card)).length;
    }

    isInfiniteGlyph(glyph) {
      return this.isVowelGlyph(glyph) || (
        Array.isArray(this.state?.infiniteGlyphs)
        && this.state.infiniteGlyphs.includes(glyph)
      );
    }

    isInfiniteCard(card) {
      return Boolean(card && card.source === "infinite");
    }

    _baseDeckGlyphs() {
      const removed = new Set(this.state.removedLetters);
      const glyphs = [];
      LETTERS.forEach(letter => {
        if (!VOWELS.has(letter) && !removed.has(letter)) glyphs.push(glyphForLetter(letter));
      });
      return glyphs;
    }

    _isVowelCard(cardOrGlyph) {
      const glyph = typeof cardOrGlyph === "string" ? cardOrGlyph : cardOrGlyph?.glyph;
      return this.isVowelGlyph(glyph);
    }

    _prepareInitialHand() {
      const cards = shuffle(this._baseDeckGlyphs(), this.random)
        .map(glyph => this._newCard(glyph, "deck"));
      const handSize = Math.min(this.getHandLimit(), cards.length);
      this.state.infiniteGlyphs = [...ALWAYS_AVAILABLE_VOWELS];
      this.state.hand = cards.slice(0, handSize);
      this.state.deck = cards.slice(handSize);
      this.state.discard = [];
      this._syncInfiniteCards();
    }

    _beginRound() {
      const state = this.state;
      state.status = "playing";
      state.roundScore = 0;
      state.secret = this._pickSecret();
      state.usedSecrets.push(state.secret);
      state.history = [];
      state.guessesUsed = 0;
      state.mulligansLeft = BASE_MULLIGANS + state.upgrades.extraMulligans;
      state.knownAbsent = [];
      state.knownPresent = [];
      state.infiniteGlyphs = [...ALWAYS_AVAILABLE_VOWELS];
      state.revealedPositions = Array(5).fill(null);
      state.activeQuest = null;
      state.questRewardChoices = [];
      state.questRewardRefreshesLeft = 0;
      state.pendingRoundEnd = null;
      state.upgradeChoices = [];
      state.upgradePhase = null;
      state.upgradeMilestone = null;
      state.draft = [];
      state.failureReason = null;
      state.suggestedWord = null;
      this._prepareInitialHand();

      const deferred = state.deferredRewards.slice();
      state.deferredRewards = [];
      const messages = [];
      deferred.forEach(rewardId => {
        const message = this._applyRewardEffect(rewardId);
        if (message) messages.push(message);
      });
      state.lastMessage = messages.length
        ? `Banked quest rewards activated: ${messages.join(" ")}`
        : `Round ${state.round}: reach ${this.getTarget()} total points and solve the fixed secret.`;
      this._ensureQuestForNextGuess();
    }

    _pickSecret() {
      const active = this.getActiveWords();
      if (!active.length) throw new Error("No Cuddle secrets remain after letter removals.");
      const used = new Set(this.state.usedSecrets);
      const unused = active.filter(word => !used.has(word));
      const pool = unused.length ? unused : active;
      return pool[Math.floor(this.random() * pool.length)];
    }

    getActiveWords() {
      const removed = new Set(this.state?.removedLetters || []);
      if (!removed.size) return this.words.slice();
      return this.words.filter(word => ![...removed].some(letter => word.includes(letter)));
    }

    getHandCard(cardId) {
      return this.state.hand.find(card => card.id === cardId) || null;
    }

    getDraftCards() {
      return this.state.draft.map(id => this.getHandCard(id)).filter(Boolean);
    }

    getDraftWord() {
      return this.getDraftCards().map(card => card.glyph).join("");
    }

    getDraftLetters() {
      return this.getDraftWord().split("");
    }

    toggleDraft(cardId) {
      if (this.state.status !== "playing") return { ok: false, error: "The round is paused." };
      const card = this.getHandCard(cardId);
      if (!card) return { ok: false, error: "That card is no longer in your hand." };
      const index = this.state.draft.indexOf(cardId);
      if (!this.isInfiniteCard(card) && index >= 0) {
        this.state.draft.splice(index, 1);
        this.save();
        return { ok: true };
      }
      if (this.getDraftWord().length + card.glyph.length > 5) {
        return { ok: false, error: "That card would take the word past five letters." };
      }
      // Green and yellow cards can be selected repeatedly because their single
      // hand slot represents an unlimited supply for the rest of the round.
      this.state.draft.push(cardId);
      this.save();
      return { ok: true };
    }

    removeDraftAt(index) {
      if (!Number.isInteger(index) || index < 0 || index >= this.state.draft.length) {
        return { ok: false, error: "That drafted card is no longer available." };
      }
      this.state.draft.splice(index, 1);
      this.save();
      return { ok: true };
    }

    backspaceDraft() {
      if (!this.state.draft.length) return { ok: false, error: "The current word is already empty." };
      this.state.draft.pop();
      this.save();
      return { ok: true };
    }

    clearDraft() {
      this.state.draft = [];
      this.save();
    }

    canSubmit() {
      const word = this.getDraftWord();
      if (word.length !== 5) return { ok: false, error: "Build exactly five letters." };
      if (!this.wordSet.has(word)) return { ok: false, error: `${word} is not in the secret-word list.` };
      if (this.state.removedLetters.some(letter => word.includes(letter))) {
        return { ok: false, error: "That word contains a letter removed from this run." };
      }
      return { ok: true, word };
    }

    _drawOne() {
      if (this.getCountedHandSize() >= this.getHandLimit()) return null;
      while (true) {
        if (!this.state.deck.length && this.state.discard.length) {
          this.state.deck = shuffle(this.state.discard, this.random);
          this.state.discard = [];
        }
        const card = this.state.deck.pop();
        if (!card) return null;
        // Vowels and discovered positive glyphs are represented by their one
        // unlimited card, never by a finite draw-pile copy.
        if (this.isInfiniteGlyph(card.glyph)) continue;
        this.state.hand.push(card);
        return card;
      }
    }

    drawCards(count) {
      const drawn = [];
      for (let i = 0; i < count && this.getCountedHandSize() < this.getHandLimit(); i += 1) {
        const card = this._drawOne();
        if (!card) break;
        drawn.push(card);
      }
      return drawn;
    }

    drawToHandLimit() {
      return this.drawCards(Math.max(0, this.getHandLimit() - this.getCountedHandSize()));
    }

    _makeRoomForRewardCard() {
      if (this.getCountedHandSize() < this.getHandLimit()) return true;
      const candidates = this.state.hand.filter(card => (
        this.cardCountsTowardHandLimit(card)
        && !this.isInfiniteCard(card)
        && !this.state.draft.includes(card.id)
      ));
      if (!candidates.length) return false;
      const victim = candidates[Math.floor(this.random() * candidates.length)];
      this._discardCards([victim.id]);
      return true;
    }

    _addBonusCard(letterOrGlyph) {
      const glyph = glyphForLetter(letterOrGlyph);
      if (this.isInfiniteGlyph(glyph)) return null;
      if (!this._makeRoomForRewardCard()) return null;
      const card = this._newCard(glyph, "reward");
      this.state.hand.push(card);
      return card;
    }

    _drawRewardCards(count) {
      const drawn = [];
      for (let index = 0; index < count; index += 1) {
        if (!this._makeRoomForRewardCard()) break;
        const card = this._drawOne();
        if (!card) break;
        drawn.push(card);
      }
      return drawn;
    }

    _discardCards(cardIds) {
      const ids = new Set(cardIds);
      const removed = [];
      this.state.hand = this.state.hand.filter(card => {
        if (!ids.has(card.id) || this.isInfiniteCard(card)) return true;
        removed.push(card);
        if (card.source === "deck") this.state.discard.push(card);
        return false;
      });
      this.state.draft = this.state.draft.filter(id => !ids.has(id));
      return removed;
    }

    _updateKnowledge(word, feedback) {
      const statusesByLetter = Object.create(null);
      word.split("").forEach((letter, index) => {
        (statusesByLetter[letter] ||= []).push(feedback[index]);
        if (feedback[index] === "green") this.state.revealedPositions[index] = letter;
      });
      const absent = new Set(this.state.knownAbsent);
      const present = new Set(this.state.knownPresent);
      Object.entries(statusesByLetter).forEach(([letter, statuses]) => {
        if (statuses.some(status => status !== "grey")) {
          present.add(letter);
          absent.delete(letter);
        } else if (!present.has(letter)) {
          absent.add(letter);
        }
      });
      this.state.knownAbsent = [...absent].sort();
      this.state.knownPresent = [...present].sort();
    }

    _trimHandToLimit() {
      while (this.getCountedHandSize() > this.getHandLimit()) {
        let removableIndex = -1;
        for (let index = this.state.hand.length - 1; index >= 0; index -= 1) {
          const card = this.state.hand[index];
          if (this.cardCountsTowardHandLimit(card)
              && !this.isInfiniteCard(card)
              && !this.state.draft.includes(card.id)) {
            removableIndex = index;
            break;
          }
        }
        if (removableIndex < 0) break;
        const [card] = this.state.hand.splice(removableIndex, 1);
        if (card.source === "deck") this.state.discard.push(card);
      }
    }

    _syncInfiniteCards() {
      const previous = new Set([
        ...ALWAYS_AVAILABLE_VOWELS,
        ...(Array.isArray(this.state.infiniteGlyphs) ? this.state.infiniteGlyphs : [])
      ]);
      const activeGlyphs = new Set([...ALWAYS_AVAILABLE_VOWELS, ...this._baseDeckGlyphs()]);
      const unlocked = new Set(ALWAYS_AVAILABLE_VOWELS);
      previous.forEach(glyph => {
        if (activeGlyphs.has(glyph)) unlocked.add(glyph);
      });
      activeGlyphs.forEach(glyph => {
        const status = this.getCardKnowledgeStatus(glyph);
        if (status === "yellow" || status === "green") unlocked.add(glyph);
      });

      const isUnlockedCard = card => Boolean(card && unlocked.has(card.glyph));
      this.state.deck = this.state.deck.filter(card => !isUnlockedCard(card));
      this.state.discard = this.state.discard.filter(card => !isUnlockedCard(card));
      this.state.hand = this.state.hand.filter(card => (
        card && card.glyph && card.source !== "infinite" && !unlocked.has(card.glyph)
      ));
      this.state.infiniteGlyphs = [...unlocked].sort();
      this.state.infiniteGlyphs.forEach(glyph => {
        this.state.hand.push({ id: `infinite-${glyph}`, glyph, source: "infinite" });
      });
      this._trimHandToLimit();
      return this.state.infiniteGlyphs.filter(glyph => !previous.has(glyph));
    }

    submitDraft() {
      const validation = this.canSubmit();
      if (!validation.ok) return validation;
      if (this.state.guessesUsed >= MAX_GUESSES) return { ok: false, error: "No guesses remain." };

      const word = validation.word;
      const feedback = evaluateFeedback(this.state.secret, word);
      const yellowCount = feedback.filter(result => result === "yellow").length;
      const greyCount = feedback.filter(result => result === "grey").length;
      const shielded = this.state.buffs.greyShield > 0;
      const scoreDelta = yellowCount * (2 + this.state.upgrades.yellowPoints)
        - (shielded ? 0 : greyCount);
      if (shielded) this.state.buffs.greyShield -= 1;

      const activeQuest = this.state.activeQuest;
      const draftIds = unique(this.state.draft);
      const draftCards = this.getDraftCards();
      this._discardCards(draftIds);
      this.state.draft = [];

      this._updateKnowledge(word, feedback);
      const infiniteUnlocked = this._syncInfiniteCards();
      // A finite consonant leaves once if it appeared in the submitted word.
      // Positive consonants stay in one counted slot; vowels remain outside the limit.
      const replacements = this.drawToHandLimit();

      this.state.guessesUsed += 1;
      this.state.score += scoreDelta;
      this.state.roundScore += scoreDelta;
      this.state.draft = [];
      this.state.suggestedWord = null;

      const entry = {
        word,
        feedback,
        scoreDelta,
        yellowCount,
        greyCount,
        shielded,
        usedCards: draftCards.map(card => card.glyph),
        replacements: replacements.length,
        infiniteUnlocked,
        questId: activeQuest?.id || null,
        questComplete: false,
        earlyBonus: 0
      };

      let questComplete = false;
      if (activeQuest) {
        const requiredLetters = [];
        this.state.history.forEach(previous => {
          previous.word.split("").forEach((letter, index) => {
            if (previous.feedback[index] !== "grey") requiredLetters.push(letter);
          });
        });
        questComplete = Boolean(window.CuddleQuestBook?.evaluateQuest(activeQuest, {
          word,
          feedback,
          history: this.state.history,
          requiredLetters,
          rareLetters: activeQuest.rareLetters || []
        }));
        entry.questComplete = questComplete;
        this.state.activeQuest = null;
      }

      const solved = word === this.state.secret;
      if (solved) {
        const earlyBonus = (MAX_GUESSES - this.state.guessesUsed)
          * (5 + this.state.upgrades.earlyRoundPoint);
        entry.earlyBonus = earlyBonus;
        this.state.score += earlyBonus;
        this.state.roundScore += earlyBonus;
        this.state.pendingRoundEnd = {
          type: "solved",
          word,
          secret: this.state.secret,
          earlyBonus,
          score: this.state.score,
          target: this.getTarget()
        };
      } else if (this.state.guessesUsed >= MAX_GUESSES) {
        this.state.pendingRoundEnd = {
          type: "outOfGuesses",
          secret: this.state.secret,
          score: this.state.score,
          target: this.getTarget()
        };
      }
      this.state.history.push(entry);

      const scoreParts = [];
      if (yellowCount) scoreParts.push(`${yellowCount} yellow`);
      if (greyCount) scoreParts.push(shielded ? `${greyCount} greys shielded` : `${greyCount} grey`);
      if (entry.infiniteUnlocked.length) scoreParts.push(`${entry.infiniteUnlocked.join(", ")} now stays in hand`);
      if (entry.earlyBonus) scoreParts.push(`+${entry.earlyBonus} early bonus`);
      this.state.lastMessage = `${word}: ${scoreDelta >= 0 ? "+" : ""}${scoreDelta} points${scoreParts.length ? ` (${scoreParts.join(", ")})` : ""}.`;

      if (questComplete) {
        this.state.status = "questReward";
        this.state.questRewardChoices = window.CuddleQuestBook?.rewardChoices(3, this.random) || [];
        this.state.questRewardRefreshesLeft = this.state.upgrades.questRefreshes;
      } else {
        if (activeQuest) this.state.lastMessage += ` Quest missed: ${activeQuest.title}.`;
        if (this.state.pendingRoundEnd) this._resolvePendingRoundEnd();
        else this._ensureQuestForNextGuess();
      }

      this.save();
      return {
        ok: true,
        word,
        feedback,
        scoreDelta,
        earlyBonus: entry.earlyBonus,
        infiniteUnlocked,
        solved,
        questComplete
      };
    }

    getMulliganLimit() {
      return BASE_MULLIGAN_SIZE + this.state.upgrades.mulliganSize;
    }

    mulligan(cardIds) {
      if (this.state.status !== "playing") return { ok: false, error: "The round is paused." };
      const ids = unique(cardIds || []);
      if (this.state.mulligansLeft <= 0) return { ok: false, error: "No mulligans remain this round." };
      if (!ids.length || ids.length > this.getMulliganLimit()) {
        return { ok: false, error: `Choose 1–${this.getMulliganLimit()} cards.` };
      }
      if (ids.some(id => this.state.draft.includes(id))) {
        return { ok: false, error: "Return drafted cards before using a mulligan." };
      }
      if (ids.some(id => !this.getHandCard(id))) return { ok: false, error: "One selected card is unavailable." };
      if (ids.some(id => this.isInfiniteCard(this.getHandCard(id)))) {
        return { ok: false, error: "Unlimited cards cannot be mulliganed." };
      }
      this._discardCards(ids);
      const replacements = this.drawCards(ids.length);
      this.state.mulligansLeft -= 1;
      this.state.lastMessage = `Mulligan: replaced ${replacements.length} card${replacements.length === 1 ? "" : "s"}.`;
      this.save();
      return { ok: true, replacements: replacements.length };
    }

    cardIsKnownGrey(card) {
      const absent = new Set(this.state.knownAbsent);
      return card.glyph.split("").some(letter => absent.has(letter));
    }

    getCardKnowledgeStatus(cardOrGlyph) {
      const glyph = typeof cardOrGlyph === "string" ? cardOrGlyph : cardOrGlyph?.glyph;
      if (!glyph) return "unused";
      const positiveLetter = glyphForLetter(glyph);
      if (this.state.revealedPositions.includes(positiveLetter)) return "green";
      let sawYellow = false;
      for (const entry of this.state.history) {
        for (let index = 0; index < String(entry.word || "").length; index += 1) {
          if (entry.word[index] !== positiveLetter) continue;
          if (entry.feedback?.[index] === "green") return "green";
          if (entry.feedback?.[index] === "yellow") sawYellow = true;
        }
      }
      if (sawYellow || this.state.knownPresent.includes(positiveLetter)) return "yellow";
      const absent = new Set(this.state.knownAbsent);
      if (absent.has(positiveLetter)) return "red";
      return "unused";
    }

    getGreyExchangeCost() {
      return Math.max(1, BASE_GREY_EXCHANGE - this.state.upgrades.exchangeReduction);
    }

    getGreyCards() {
      return this.state.hand.filter(card => (
        !this.isInfiniteCard(card)
        && !this.state.draft.includes(card.id)
        && this.cardIsKnownGrey(card)
      ));
    }

    exchangeGreys(cardIds) {
      if (this.state.status !== "playing") return { ok: false, error: "The round is paused." };
      const ids = unique(cardIds || []);
      const cost = this.getGreyExchangeCost();
      if (ids.length !== cost) return { ok: false, error: `Choose exactly ${cost} red card${cost === 1 ? "" : "s"}.` };
      const cards = ids.map(id => this.getHandCard(id));
      if (cards.some(card => !card || this.isInfiniteCard(card) || !this.cardIsKnownGrey(card))) {
        return { ok: false, error: "Only finite confirmed-red cards can be exchanged." };
      }
      if (ids.some(id => this.state.draft.includes(id))) {
        return { ok: false, error: "Return drafted cards before exchanging them." };
      }
      this._discardCards(ids);
      const drawn = this.drawCards(1);
      this.state.lastMessage = drawn.length
        ? `Exchanged ${cost} red card${cost === 1 ? "" : "s"} for one draw.`
        : "The piles are empty; no card could be drawn.";
      this.save();
      return { ok: true, drawn: drawn.length };
    }

    canBuildWord(word, cards = this.state.hand) {
      const tokens = tokensForWord(word);
      if (!tokens) return false;
      const available = Object.create(null);
      const unlimited = new Set();
      cards.forEach(card => {
        if (this.isInfiniteCard(card)) unlimited.add(card.glyph);
        else available[card.glyph] = (available[card.glyph] || 0) + 1;
      });
      return tokens.every(token => {
        if (unlimited.has(token)) return true;
        if ((available[token] || 0) <= 0) return false;
        available[token] -= 1;
        return true;
      });
    }

    getFeasibleWords(limit = 400) {
      const feasible = [];
      const draftSet = new Set(this.state.draft);
      const cards = this.state.hand.filter(card => (
        this.isInfiniteCard(card) || !draftSet.has(card.id)
      ));
      for (const word of this.getActiveWords()) {
        if (this.canBuildWord(word, cards)) feasible.push(word);
        if (feasible.length >= limit) break;
      }
      return feasible;
    }

    getRareLetters(count = 6) {
      const active = this.getActiveWords();
      const frequencies = LETTERS
        .filter(letter => !VOWELS.has(letter) && !this.state.removedLetters.includes(letter))
        .map(letter => ({ letter, count: active.reduce((sum, word) => sum + Number(word.includes(letter)), 0) }))
        .filter(item => item.count > 0)
        .sort((a, b) => a.count - b.count || a.letter.localeCompare(b.letter));
      return frequencies.slice(0, count).map(item => item.letter);
    }

    _ensureQuestForNextGuess() {
      if (this.state.status !== "playing" || this.state.activeQuest) return;
      const nextGuess = this.state.guessesUsed + 1;
      if (nextGuess > MAX_GUESSES) return;
      const cadence = Math.max(1, 3 - this.state.upgrades.questCadence);
      if (nextGuess < cadence || nextGuess % cadence !== 0) return;
      const feasibleWords = this.getFeasibleWords();
      this.state.activeQuest = window.CuddleQuestBook?.createQuest({
        feasibleWords,
        secret: this.state.secret,
        history: this.state.history,
        rareLetters: this.getRareLetters(),
        random: this.random
      }) || {
        id: "validPlay",
        icon: "🃏",
        title: "Make It Count",
        description: "Submit any valid five-letter word this turn."
      };
    }

    refreshQuestRewards() {
      if (this.state.status !== "questReward") return { ok: false, error: "No quest reward is open." };
      if (this.state.questRewardRefreshesLeft <= 0) return { ok: false, error: "No reward refreshes remain." };
      this.state.questRewardRefreshesLeft -= 1;
      this.state.questRewardChoices = window.CuddleQuestBook?.rewardChoices(3, this.random) || [];
      this.save();
      return { ok: true };
    }

    chooseQuestReward(rewardId) {
      if (this.state.status !== "questReward") return { ok: false, error: "No quest reward is open." };
      if (!this.state.questRewardChoices.some(reward => reward.id === rewardId)) {
        return { ok: false, error: "That reward is not available." };
      }

      let message;
      if (this.state.pendingRoundEnd?.type === "solved"
          && this.state.score >= this.getTarget()
          && this.state.round < THRESHOLDS.length) {
        this.state.deferredRewards.push(rewardId);
        message = "Reward banked for the opening hand of the next round.";
      } else {
        message = this._applyRewardEffect(rewardId);
      }
      this.state.lastMessage = message || "Quest reward applied.";
      this.state.questRewardChoices = [];
      this.state.questRewardRefreshesLeft = 0;

      if (this.state.pendingRoundEnd) this._resolvePendingRoundEnd();
      else {
        this.state.status = "playing";
        this._ensureQuestForNextGuess();
      }
      this.save();
      return { ok: true, message: this.state.lastMessage };
    }

    _hiddenPositions() {
      return this.state.revealedPositions
        .map((letter, index) => (letter ? null : index))
        .filter(index => index !== null);
    }

    _randomHandLetter() {
      if (!this.state.hand.length) return null;
      const card = this.state.hand[Math.floor(this.random() * this.state.hand.length)];
      return glyphForLetter(card.glyph);
    }

    _applyRewardEffect(rewardId) {
      switch (rewardId) {
        case "suggestGuess": {
          const active = this.getActiveWords();
          const handCounts = Object.create(null);
          this.state.hand.forEach(card => {
            handCounts[card.glyph] = this.isInfiniteCard(card)
              ? Infinity
              : (handCounts[card.glyph] || 0) + 1;
          });
          let best = null;
          let bestDeficit = Infinity;
          active.forEach(word => {
            const tokens = tokensForWord(word);
            if (!tokens) return;
            const needs = Object.create(null);
            tokens.forEach(token => { needs[token] = (needs[token] || 0) + 1; });
            const deficit = Object.entries(needs).reduce(
              (sum, [token, count]) => sum + Math.max(0, count - (handCounts[token] || 0)),
              0
            );
            if (deficit < bestDeficit || (deficit === bestDeficit && this.random() < 0.08)) {
              best = { word, tokens, needs };
              bestDeficit = deficit;
            }
          });
          if (!best) return "No suggestion was available.";
          const useful = best.tokens.find(token => (handCounts[token] || 0) < (best.needs[token] || 0))
            || best.tokens.find(token => !this.isInfiniteGlyph(token))
            || best.tokens[0];
          const added = this._addBonusCard(useful);
          this.state.suggestedWord = best.word;
          return added
            ? `Suggestion: ${best.word}. ${useful} replaced one finite hand card.`
            : `Suggestion: ${best.word}. Your reusable hand already covers its useful letters.`;
        }
        case "rouletteSecret": {
          const drawn = this._drawRewardCards(3);
          return `Roulette Draw refreshed ${drawn.length} finite card${drawn.length === 1 ? "" : "s"}; the secret stayed fixed.`;
        }
        case "revealHistory": {
          const pool = shuffle(
            this.state.discard.filter(card => !this.isInfiniteGlyph(card.glyph)),
            this.random
          ).slice(0, 2);
          if (!pool.length) {
            const drawn = this._drawRewardCards(2);
            return `No discard was available, so Recover refreshed ${drawn.length} finite card${drawn.length === 1 ? "" : "s"}.`;
          }
          const added = pool.map(card => this._addBonusCard(card.glyph)).filter(Boolean);
          return `Recover copied ${added.length ? added.map(card => card.glyph).join(" and ") : "no additional cards"} into the counted hand.`;
        }
        case "stealthGuess":
          this.state.buffs.greyShield += 1;
          return "Stealth Guess armed: the next guess ignores grey penalties.";
        case "revealGreen": {
          const hidden = this._hiddenPositions();
          if (!hidden.length) {
            const drawn = this._drawRewardCards(2);
            return `Every position was already known, so you refreshed ${drawn.length} finite card${drawn.length === 1 ? "" : "s"}.`;
          }
          const index = hidden[Math.floor(this.random() * hidden.length)];
          const letter = this.state.secret[index];
          this.state.revealedPositions[index] = letter;
          this.state.knownPresent = unique([...this.state.knownPresent, letter]).sort();
          this._syncInfiniteCards();
          return `Position ${index + 1} is ${letter}; ${glyphForLetter(letter)} now stays in hand.`;
        }
        case "nonsense": {
          const glyphs = this._baseDeckGlyphs().filter(glyph => !this.isInfiniteGlyph(glyph));
          const added = [];
          for (let i = 0; i < 2 && glyphs.length; i += 1) {
            const glyph = glyphs[Math.floor(this.random() * glyphs.length)];
            const card = this._addBonusCard(glyph);
            if (card) added.push(card.glyph);
          }
          return `Nonsense replaced finite cards with ${added.length ? added.join(" and ") : "no new letters"}.`;
        }
        case "letterProbe": {
          const letter = this._randomHandLetter();
          if (!letter) return "There was no hand card to probe.";
          const count = this.state.secret.split("").filter(value => value === letter).length;
          if (!count) this.state.knownAbsent = unique([...this.state.knownAbsent, letter]).sort();
          else {
            this.state.knownPresent = unique([...this.state.knownPresent, letter]).sort();
            this._syncInfiniteCards();
          }
          return `Probe result: ${letter} appears ${count} time${count === 1 ? "" : "s"} in the secret${count ? " and is now stays in hand" : ""}.`;
        }
        case "revealLocation": {
          const hidden = this._hiddenPositions();
          if (!hidden.length) {
            const drawn = this._drawRewardCards(1);
            return `Every position was already known, so you refreshed ${drawn.length} finite card instead.`;
          }
          const index = hidden[Math.floor(this.random() * hidden.length)];
          const letter = this.state.secret[index];
          this.state.revealedPositions[index] = letter;
          this.state.knownPresent = unique([...this.state.knownPresent, letter]).sort();
          this._syncInfiniteCards();
          return `Position ${index + 1} is ${letter}; ${glyphForLetter(letter)} now stays in hand.`;
        }
        case "letterProfile": {
          const letter = this._randomHandLetter();
          if (!letter) return "There was no hand card to profile.";
          const count = this.state.secret.split("").filter(value => value === letter).length;
          if (!count) this.state.knownAbsent = unique([...this.state.knownAbsent, letter]).sort();
          else {
            this.state.knownPresent = unique([...this.state.knownPresent, letter]).sort();
            this._syncInfiniteCards();
          }
          return `Profile: ${letter} occurs ${count} time${count === 1 ? "" : "s"}${count ? " and is now stays in hand" : ""}.`;
        }
        default:
          return "Quest reward applied.";
      }
    }

    _resolvePendingRoundEnd() {
      const pending = this.state.pendingRoundEnd;
      if (!pending) return;
      this.state.pendingRoundEnd = null;
      this.state.lastRoundSummary = {
        round: this.state.round,
        secret: pending.secret,
        score: this.state.score,
        roundScore: this.state.roundScore,
        target: this.getTarget(),
        earlyBonus: pending.earlyBonus || 0,
        guesses: this.state.guessesUsed
      };

      if (pending.type === "outOfGuesses") {
        this.state.status = "lost";
        this.state.failureReason = `You did not find ${pending.secret} in six guesses.`;
        return;
      }
      if (this.state.score < this.getTarget()) {
        this.state.status = "lost";
        this.state.failureReason = `You solved ${pending.secret}, but needed ${this.getTarget()} total points to continue.`;
        return;
      }
      if (this.state.round >= THRESHOLDS.length) {
        this.state.status = "won";
        this.state.failureReason = null;
        return;
      }

      this.state.status = "upgrade";
      this.state.upgradePhase = "round";
      this.state.pendingMilestones = Math.max(0, Math.floor(this.state.score / 50) - this.state.milestonesClaimed);
      this.state.upgradeMilestone = null;
      this.state.upgradeChoices = this._generateUpgradeChoices();
    }

    _removalCandidate() {
      const active = this.getActiveWords();
      const used = new Set(this.state.usedSecrets);
      const remainingRounds = THRESHOLDS.length - this.state.round;
      const candidates = LETTERS
        .filter(letter => !VOWELS.has(letter) && !this.state.removedLetters.includes(letter))
        .map(letter => {
          const frequency = active.reduce((sum, word) => sum + Number(word.includes(letter)), 0);
          const future = active.filter(word => !word.includes(letter) && !used.has(word)).length;
          return { letter, frequency, future };
        })
        .filter(item => item.frequency > 0 && item.future >= remainingRounds)
        .sort((a, b) => a.frequency - b.frequency || a.letter.localeCompare(b.letter))
        .slice(0, 10);
      if (!candidates.length) return null;
      return candidates[Math.floor(this.random() * candidates.length)].letter;
    }

    _upgradeCatalog() {
      const choices = [
        {
          id: "extraMulligans",
          icon: "🔄",
          title: "Second Thoughts",
          description: "Gain one additional mulligan each round."
        },
        {
          id: "yellowPoints",
          icon: "🟨",
          title: "Golden Value",
          description: "Every yellow tile is worth one additional point."
        },
        {
          id: "earlyRoundPoint",
          icon: "⏱️",
          title: "Quick Cuddle",
          description: "Each unused guess in the solve bonus is worth one additional point."
        },
        {
          id: "questRefreshes",
          icon: "♻️",
          title: "Reward Refresh",
          description: "Gain one refresh whenever you choose a quest reward."
        }
      ];
      if (this.state.upgrades.exchangeReduction < 2) {
        choices.push({
          id: "exchangeReduction",
          icon: "🩶",
          title: "Better Recycling",
          description: "Exchange one fewer confirmed red card for a new draw."
        });
      }
      if (this.state.upgrades.mulliganSize < 2) {
        choices.push({
          id: "mulliganSize",
          icon: "🃏",
          title: "Bigger Mulligan",
          description: "Each mulligan may replace one additional card."
        });
      }
      if (this.state.upgrades.questCadence < 2) {
        const nextCadence = Math.max(1, 2 - this.state.upgrades.questCadence);
        choices.push({
          id: "questCadence",
          icon: "❗",
          title: nextCadence === 1 ? "Quest Every Turn" : "Quests Sooner",
          description: nextCadence === 1
            ? "A quest appears on every guess. This is the final cadence upgrade."
            : "A quest appears every two guesses instead of every three."
        });
      }
      const letter = this._removalCandidate();
      if (letter) {
        choices.push({
          id: "removeLetter",
          key: `removeLetter:${letter}`,
          letter,
          icon: "✂️",
          title: `Cull ${letter}`,
          description: `Remove ${letter} from the deck and from every future secret. It was drawn from the ten least-common eligible consonants.`
        });
      }
      return choices.map(choice => ({ ...choice, key: choice.key || choice.id }));
    }

    _generateUpgradeChoices() {
      return shuffle(this._upgradeCatalog(), this.random).slice(0, 3);
    }

    chooseUpgrade(choiceKey) {
      if (this.state.status !== "upgrade") return { ok: false, error: "No upgrade choice is open." };
      const choice = this.state.upgradeChoices.find(item => item.key === choiceKey);
      if (!choice) return { ok: false, error: "That upgrade is not available." };

      switch (choice.id) {
        case "removeLetter":
          this.state.removedLetters = unique([...this.state.removedLetters, choice.letter]).sort();
          break;
        case "extraMulligans":
        case "exchangeReduction":
        case "mulliganSize":
        case "yellowPoints":
        case "earlyRoundPoint":
        case "questRefreshes":
        case "questCadence":
          this.state.upgrades[choice.id] += 1;
          break;
        default:
          return { ok: false, error: "Unknown upgrade." };
      }
      this.state.lastMessage = `${choice.title} acquired.`;

      if (this.state.upgradePhase === "round") {
        if (this.state.pendingMilestones > 0) {
          this.state.upgradePhase = "milestone";
          this.state.upgradeMilestone = (this.state.milestonesClaimed + 1) * 50;
          this.state.upgradeChoices = this._generateUpgradeChoices();
        } else {
          this._advanceRound();
        }
      } else {
        this.state.milestonesClaimed += 1;
        this.state.pendingMilestones = Math.max(0, this.state.pendingMilestones - 1);
        if (this.state.pendingMilestones > 0) {
          this.state.upgradeMilestone = (this.state.milestonesClaimed + 1) * 50;
          this.state.upgradeChoices = this._generateUpgradeChoices();
        } else {
          this._advanceRound();
        }
      }
      this.save();
      return { ok: true };
    }

    _advanceRound() {
      this.state.round += 1;
      this._beginRound();
    }

    getUpgradeSummary() {
      const rules = this.getRulesSummary();
      const removed = this.state.removedLetters.length ? this.state.removedLetters.join(", ") : "None";
      return [
        `Mulligans: ${rules.mulligans} × up to ${rules.mulliganSize}`,
        `Red exchange: ${rules.greyExchange} → 1`,
        `Yellow value: ${rules.yellowPoints}`,
        `Early value: ${rules.earlyPoint} per unused guess`,
        `Quest cadence: every ${rules.questCadence} turn${rules.questCadence === 1 ? "" : "s"}`,
        `Quest refreshes: ${rules.questRefreshes}`,
        `Removed letters: ${removed}`
      ];
    }
  }

  /* UMT_USER_FIX_PACK_V1: ENGINE OVERRIDES START */
  // Every visible hand glyph may be reused while constructing the current word.
  CuddleGame.prototype.toggleDraft = function toggleDraftReusable(cardId) {
    if (this.state.status !== "playing") return { ok: false, error: "The round is paused." };
    const card = this.getHandCard(cardId);
    if (!card) return { ok: false, error: "That card is no longer in your hand." };
    if (this.getDraftWord().length + card.glyph.length > 5) {
      return { ok: false, error: "That card would take the word past five letters." };
    }
    this.state.draft.push(cardId);
    this.save();
    return { ok: true };
  };

  CuddleGame.prototype.canBuildWord = function canBuildWordReusable(word, cards = this.state.hand) {
    const tokens = tokensForWord(word);
    if (!tokens) return false;
    const available = new Set((cards || []).map(card => card?.glyph).filter(Boolean));
    return tokens.every(token => available.has(token));
  };

  CuddleGame.prototype.getFeasibleWords = function getFeasibleWordsReusable(limit = 400) {
    const feasible = [];
    for (const word of this.getActiveWords()) {
      if (this.canBuildWord(word, this.state.hand)) feasible.push(word);
      if (feasible.length >= limit) break;
    }
    return feasible;
  };

  // Keep the Suggest Guess reward consistent with reusable finite letters.
  const originalCuddleApplyRewardEffect = CuddleGame.prototype._applyRewardEffect;
  CuddleGame.prototype._applyRewardEffect = function applyReusableLetterReward(rewardId) {
    if (rewardId !== "suggestGuess") {
      return originalCuddleApplyRewardEffect.call(this, rewardId);
    }

    const active = this.getActiveWords();
    const available = new Set(this.state.hand.map(card => card.glyph));
    let best = null;
    let bestDeficit = Infinity;
    active.forEach(word => {
      const tokens = tokensForWord(word);
      if (!tokens) return;
      const missing = unique(tokens.filter(token => !available.has(token)));
      const deficit = missing.length;
      if (deficit < bestDeficit || (deficit === bestDeficit && this.random() < 0.08)) {
        best = { word, missing };
        bestDeficit = deficit;
      }
    });
    if (!best) return "No suggestion was available.";

    const useful = best.missing[0] || null;
    const added = useful ? this._addBonusCard(useful) : null;
    this.state.suggestedWord = best.word;
    return added
      ? `Suggestion: ${best.word}. ${useful} replaced one finite hand card.`
      : `Suggestion: ${best.word}. Your reusable hand already covers its letters.`;
  };
  /* UMT_USER_FIX_PACK_V1: ENGINE OVERRIDES END */

  window.CuddleEngine = Object.freeze({
    CuddleGame,
    VERSION,
    STORAGE_KEY,
    THRESHOLDS,
    MAX_GUESSES,
    BASE_HAND_SIZE,
    BASE_MULLIGANS,
    BASE_MULLIGAN_SIZE,
    BASE_GREY_EXCHANGE,
    VOWELS,
    ALWAYS_AVAILABLE_VOWELS,
    normalizeWords,
    evaluateFeedback,
    tokensForWord,
    glyphForLetter
  });
}());
