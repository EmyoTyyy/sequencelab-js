/* =================================================================== *
 *  SequenceLab — inline SVG icon set.
 *  16x16, stroke=currentColor, 1.4 weight, round caps — matching the
 *  Site tromp icon style. ICON(name) returns markup; elements carrying
 *  a data-icon attribute are hydrated automatically.
 * =================================================================== */
window.ICON = (function () {
  "use strict";

  const P = {
    play: '<path d="M5 3.5 L12.5 8 L5 12.5 Z"/>',
    plus: '<line x1="8" y1="3.5" x2="8" y2="12.5"/><line x1="3.5" y1="8" x2="12.5" y2="8"/>',
    minus: '<line x1="3.5" y1="8" x2="12.5" y2="8"/>',
    x: '<line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/>',
    check: '<path d="M3.5 8.5l3 3 6-7"/>',
    folder: '<path d="M2.5 4.8a1 1 0 0 1 1-1H6l1.3 1.5h5.2a1 1 0 0 1 1 1V12a.6.6 0 0 1-.6.6H3.1A.6.6 0 0 1 2.5 12z"/>',
    file: '<path d="M4 2.2h5.2L12 5v8.2a.6.6 0 0 1-.6.6H4a.6.6 0 0 1-.6-.6V2.8A.6.6 0 0 1 4 2.2z"/><path d="M9.2 2.4V5H12"/>',
    note: '<path d="M3 3.6a.6.6 0 0 1 .6-.6h8.8a.6.6 0 0 1 .6.6V9.5L9.5 13H3.6a.6.6 0 0 1-.6-.6z"/><path d="M9.5 13V9.5H13"/><line x1="5.4" y1="6.2" x2="10.6" y2="6.2"/>',
    gear: { vb: "0 0 24 24", d: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>' },
    reset: '<path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5"/><path d="M2.6 3v3.1h3.1"/>',
    refresh: '<path d="M12.8 8a4.8 4.8 0 1 1-1.5-3.5"/><path d="M13.4 3v3.1h-3.1"/>',
    trash: '<path d="M3.5 4.5h9"/><path d="M5.6 4.5V3.6a1 1 0 0 1 1-1h2.8a1 1 0 0 1 1 1v.9"/><path d="M4.6 4.5l.5 8a1 1 0 0 0 1 .95h3.8a1 1 0 0 0 1-.95l.5-8"/>',
    table: '<rect x="2.5" y="3" width="11" height="10" rx="1"/><line x1="2.5" y1="6.4" x2="13.5" y2="6.4"/><line x1="7" y1="6.4" x2="7" y2="13"/>',
    eye: '<path d="M1.6 8s2.5-4.4 6.4-4.4S14.4 8 14.4 8 11.9 12.4 8 12.4 1.6 8 1.6 8Z"/><circle cx="8" cy="8" r="1.7"/>',
    key: '<circle cx="5.6" cy="6" r="2.6"/><path d="M7.4 7.9 12.6 13.1"/><path d="M10.6 11.1 12 9.7"/>',
    link: '<path d="M5 11 11 5"/><path d="M6.6 5H11v4.4"/>',
    download: '<line x1="8" y1="2.5" x2="8" y2="10"/><path d="M5 7l3 3 3-3"/><path d="M3 12.8h10"/>',
    upload: '<line x1="8" y1="10.5" x2="8" y2="3"/><path d="M5 6l3-3 3 3"/><path d="M3 12.8h10"/>',
    chevron: '<path d="M6 3.5 10.5 8 6 12.5"/>',
    "chevron-left": '<path d="M10 3.5 5.5 8 10 12.5"/>',
    "chevron-right": '<path d="M6 3.5 10.5 8 6 12.5"/>',
    pencil: '<path d="M10.5 3 13 5.5"/><path d="M3 13l.7-2.6 7-7L13 5.8l-7 7z"/>',
    "arrow-right": '<line x1="3" y1="8" x2="12.5" y2="8"/><path d="M9 4.5 12.5 8 9 11.5"/>',
    "arrow-up": '<line x1="8" y1="13" x2="8" y2="3.5"/><path d="M4.5 7 8 3.5 11.5 7"/>',
    "arrow-down": '<line x1="8" y1="3" x2="8" y2="12.5"/><path d="M4.5 9 8 12.5 11.5 9"/>',
    bookmark: '<path d="M4.5 2.6h7a.5.5 0 0 1 .5.5v10l-4-2.6-4 2.6V3.1a.5.5 0 0 1 .5-.5z"/>',
    terminal: '<rect x="2" y="3" width="12" height="10" rx="1"/><path d="M4.8 6.5 7 8.5 4.8 10.5"/><line x1="8.4" y1="10.6" x2="11" y2="10.6"/>',
    format: '<path d="M6.2 3.2C4.7 3.2 4.9 4.8 4.9 6c0 1-.9 2-1.9 2 1 0 1.9 1 1.9 2 0 1.2-.2 2.8 1.3 2.8"/><path d="M9.8 3.2c1.5 0 1.3 1.6 1.3 2.8 0 1 .9 2 1.9 2-1 0-1.9 1-1.9 2 0 1.2.2 2.8-1.3 2.8"/>',
    layout: '<rect x="2.5" y="2.5" width="11" height="11" rx="1"/><line x1="7" y1="2.5" x2="7" y2="13.5"/><line x1="7" y1="8" x2="13.5" y2="8"/>',
    maximize: '<path d="M3 6V3.2h2.8"/><path d="M13 6V3.2h-2.8"/><path d="M3 10v2.8h2.8"/><path d="M13 10v2.8h-2.8"/>',
    diagram: '<rect x="5.5" y="2" width="5" height="3.2" rx=".5"/><rect x="1.6" y="10.8" width="4.4" height="3.2" rx=".5"/><rect x="10" y="10.8" width="4.4" height="3.2" rx=".5"/><path d="M8 5.2v2.6M3.8 10.8V8h8.4v2.8"/>',
    eraser: '<path d="M7.5 12.5h5"/><path d="M9.2 12.5 3.5 6.8a1 1 0 0 1 0-1.4l3-3a1 1 0 0 1 1.4 0l4 4a1 1 0 0 1 0 1.4l-4.7 4.7z"/>',
    database: '<ellipse cx="8" cy="3.6" rx="5.2" ry="1.8"/><path d="M2.8 3.6v8.8c0 1 2.3 1.8 5.2 1.8s5.2-.8 5.2-1.8V3.6"/><path d="M2.8 8c0 1 2.3 1.8 5.2 1.8S13.2 9 13.2 8"/>',
    clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.2l2.2 1.3"/>',
    book: '<path d="M2.7 13a1.7 1.7 0 0 1 1.7-1.7h8.9"/><path d="M4.4 1.3h8.9v13.4H4.4A1.7 1.7 0 0 1 2.7 13V3a1.7 1.7 0 0 1 1.7-1.7z"/>',
    filter: '<path d="M2.5 3.5h11L9.7 8.4v4.1l-3.4-1.7V8.4z"/>',
    save: '<path d="M3.5 3h7.8L13 4.7V13a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 3 13V3.5a.5.5 0 0 1 .5-.5z"/><path d="M5.2 3.2v3.2h5.4V3.2"/><rect x="5.2" y="9.2" width="5.6" height="4.1"/>',
    copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M2.5 10.5V3a.5.5 0 0 1 .5-.5h7.5"/>',
    paste: '<rect x="3.5" y="3" width="9" height="10.5" rx="1"/><rect x="6" y="1.8" width="4" height="2.4" rx=".5"/>',
    clone: '<rect x="2.8" y="2.8" width="8" height="8" rx="1"/><path d="M5.4 13.2h6.8a1 1 0 0 0 1-1V5.4"/>',
    slash: '<circle cx="8" cy="8" r="5.2"/><line x1="4.4" y1="11.6" x2="11.6" y2="4.4"/>',
    "chevron-down": '<path d="M3.5 6 8 10.5 12.5 6"/>',
    "chevron-up": '<path d="M3.5 10 8 5.5 12.5 10"/>',
    search: '<circle cx="7" cy="7" r="4.4"/><line x1="10.4" y1="10.4" x2="13.5" y2="13.5"/>',
    pin: '<path d="M8 11.3v3.4"/><path d="M6 7.2a1.3 1.3 0 0 1-.74 1.2l-1.2.6a1.3 1.3 0 0 0-.73 1.2v.45a.65.65 0 0 0 .65.65h8.04a.65.65 0 0 0 .65-.65v-.45a1.3 1.3 0 0 0-.73-1.2l-1.2-.6A1.3 1.3 0 0 1 10 7.2V4h.65a1.3 1.3 0 1 0 0-2.6h-5.3a1.3 1.3 0 1 0 0 2.6H6z"/>',
    "panel-left": '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M6.2 3.7v8.6H4.2c-.8 0-1.5-.7-1.5-1.5V5.2c0-.8.7-1.5 1.5-1.5z" fill="currentColor" stroke="none"/>',
    "panel-right": '<rect x="2" y="3" width="12" height="10" rx="1.5"/><line x1="9.8" y1="3.2" x2="9.8" y2="12.8"/>',
  };

  function ICON(name) {
    const entry = P[name];
    if (!entry) return "";
    const vb = typeof entry === "object" ? entry.vb : "0 0 16 16";
    const d = typeof entry === "object" ? entry.d : entry;
    return (
      `<svg class="icn" viewBox="${vb}" fill="none" stroke="currentColor" ` +
      `stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" ` +
      `aria-hidden="true">${d}</svg>`
    );
  }

  function hydrate(root) {
    (root || document).querySelectorAll("[data-icon]").forEach((el) => {
      if (el.dataset.iconDone) return;
      el.dataset.iconDone = "1";
      el.insertAdjacentHTML("afterbegin", ICON(el.dataset.icon));
    });
  }

  ICON.hydrate = hydrate;
  hydrate(); // static buttons are already in the DOM above this script
  return ICON;
})();
