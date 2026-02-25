// domUtils.js
export const DOM = {
  get(id) {
    return document.getElementById(id);
  },

  show(id) {
    this.get(id)?.classList.remove("hidden");
  },

  hide(id) {
    this.get(id)?.classList.add("hidden");
  },

  toggleClass(id, className, condition) {
    this.get(id)?.classList.toggle(className, condition);
  }
};
