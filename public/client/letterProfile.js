// client/letterProfile.js — renders the "Letter Profile" power's category
// breakdown box for both roles. Shared formatting since both boxes render
// the exact same {mode, ...counts} shape (see server/utils/letterProfile.js).

const LETTER_PROFILE_LABELS = {
  halves: [["A–M", "am"], ["N–Z", "nz"]],
  rows: [["Top", "top"], ["Home", "home"], ["Bottom", "bottom"]],
  vowels: [["Vowels", "vowels"], ["Consonants", "consonants"]]
};

function letterProfileLines(stat) {
  const spec = LETTER_PROFILE_LABELS[stat?.mode];
  if (!spec) return "";
  return spec
    .map(
      ([label, key]) => `
        <div class="line">
          <span class="label">${label}</span>
          <span class="value">${stat[key]}</span>
        </div>`
    )
    .join("");
}

function renderLetterProfileBox(boxId, stat) {
  const box = document.getElementById(boxId);
  if (!box) return;

  if (!stat || !stat.mode) {
    box.innerHTML = "";
    box.hidden = true;
    return;
  }

  box.hidden = false;
  box.innerHTML = `<div class="title">📊 Letter Profile</div>${letterProfileLines(stat)}`;
}

window.renderSetterLetterProfileBox = function (stat) {
  renderLetterProfileBox("SetterLetterProfileBox", stat);
};

window.renderGuesserLetterProfileBox = function (stat) {
  renderLetterProfileBox("GuesserLetterProfileBox", stat);
};
