// Renders the module-card header shell (icon, title, tag, optional
// description/count-badge, and toggle) from MODULE_CARDS data. One
// function replaces what used to be 23 hand-duplicated header blocks
// across the Learn/Reflect/Implement/Participant screens.
function renderModuleHeader(m) {
  const onclick = m.isDoor
    ? `openModulePage('${m.id}','${m.screen}')`
    : `toggleModule('${m.id}')`;

  const descHTML = m.descText
    ? `<div class="module-desc">${m.descText}</div>`
    : '';

  const rightHTML = m.badgeText
    ? `<div class="module-header-right"><span class="module-count-badge">${m.badgeText}</span><div class="module-toggle">+</div></div>`
    : `<div class="module-toggle">+</div>`;

  return `<div class="module-header" onclick="${onclick}">
          <div class="module-header-left">
            ${m.icon}
            <div>
              <div class="module-title" data-i18n="${m.titleKey}">${m.titleText}</div>
              <div class="module-tag" data-i18n="${m.tagKey}">${m.tagText}</div>
              ${descHTML}
            </div>
          </div>
          ${rightHTML}
        </div>`;
}

function renderModuleHeaders() {
  MODULE_CARDS.forEach(m => {
    const card = document.getElementById(m.id);
    if (!card) return;
    card.insertAdjacentHTML('afterbegin', renderModuleHeader(m));
  });
}
