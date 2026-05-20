/* ============================================================
   BRAWL STARS TROPHY TRACKER — script.js
   Logique complète : localStorage, 30 jours, bilan, UI
   ============================================================ */

'use strict';

/* ──────────────────────────────────────────────
   CONSTANTES
────────────────────────────────────────────── */
const TOTAL_DAYS      = 30;
const DAILY_GOAL      = 1000;
const MONTHLY_GOAL    = TOTAL_DAYS * DAILY_GOAL; // 30 000
const LS_KEY_START    = 'bs_tracker_start';
const LS_KEY_DAYS     = 'bs_tracker_days';  // JSON array de 30 valeurs (null = non rempli)

/* ──────────────────────────────────────────────
   ÉTAT DE L'APPLICATION
────────────────────────────────────────────── */
let startTrophies = null;   // trophées de départ (J0)
let daysData      = [];     // tableau de 30 valeurs (null ou entier)

/* ──────────────────────────────────────────────
   SÉLECTEURS DOM
────────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const el = {
  startInput:     $('startTrophies'),
  saveStartBtn:   $('saveStartBtn'),
  editStartBtn:   $('editStartBtn'),
  startSummary:   $('startSummary'),
  startSummaryV:  $('startSummaryValue'),
  goalSummaryV:   $('goalSummaryValue'),
  setupSection:   $('setupSection'),

  statDays:       $('statDaysCompleted'),
  statGain:       $('statTotalGain'),
  statAvg:        $('statAvgPerDay'),
  statCurrent:    $('statCurrentTrophies'),
  progressFill:   $('progressBarFill'),
  progressLabel:  $('progressBarLabel'),

  calendarList:   $('calendarList'),

  bilanSection:   $('bilanSection'),
  bilanBody:      $('bilanBody'),

  resetBtn:       $('resetBtn'),
  resetModal:     $('resetModal'),
  cancelResetBtn: $('cancelResetBtn'),
  confirmResetBtn:$('confirmResetBtn'),

  toast:          $('toast'),
};

/* ──────────────────────────────────────────────
   LOCALSTORAGE : lecture / écriture
────────────────────────────────────────────── */

/** Charge les données sauvegardées depuis localStorage */
function loadFromStorage() {
  const savedStart = localStorage.getItem(LS_KEY_START);
  const savedDays  = localStorage.getItem(LS_KEY_DAYS);

  startTrophies = savedStart !== null ? parseInt(savedStart, 10) : null;
  daysData      = savedDays  !== null ? JSON.parse(savedDays)    : new Array(TOTAL_DAYS).fill(null);
}

/** Sauvegarde les trophées de départ */
function saveStart() {
  localStorage.setItem(LS_KEY_START, startTrophies);
}

/** Sauvegarde le tableau des jours */
function saveDays() {
  localStorage.setItem(LS_KEY_DAYS, JSON.stringify(daysData));
}

/* ──────────────────────────────────────────────
   CALCULS
────────────────────────────────────────────── */

/**
 * Retourne le nombre de trophées du jour précédent (J0 = startTrophies)
 * @param {number} dayIndex — 0-indexed (0 = J1)
 */
function getPrevTrophies(dayIndex) {
  if (dayIndex === 0) return startTrophies;
  // On remonte jusqu'à trouver un jour rempli
  for (let i = dayIndex - 1; i >= 0; i--) {
    if (daysData[i] !== null) return daysData[i];
  }
  return startTrophies;
}

/**
 * Calcule la différence de trophées pour un jour
 * @returns {number|null}
 */
function getDiff(dayIndex) {
  if (daysData[dayIndex] === null || startTrophies === null) return null;
  const prev = getPrevTrophies(dayIndex);
  if (prev === null) return null;
  return daysData[dayIndex] - prev;
}

/** Nombre de jours avec une valeur remplie */
function getCompletedDays() {
  return daysData.filter(v => v !== null).length;
}

/** Gain total = dernier jour rempli - départ */
function getTotalGain() {
  if (startTrophies === null) return null;
  for (let i = TOTAL_DAYS - 1; i >= 0; i--) {
    if (daysData[i] !== null) return daysData[i] - startTrophies;
  }
  return 0;
}

/** Trophées actuels (dernier jour rempli) */
function getCurrentTrophies() {
  for (let i = TOTAL_DAYS - 1; i >= 0; i--) {
    if (daysData[i] !== null) return daysData[i];
  }
  return startTrophies;
}

/* ──────────────────────────────────────────────
   RENDU : SECTION SETUP
────────────────────────────────────────────── */

function renderSetup() {
  if (startTrophies !== null) {
    // Départ déjà configuré → affiche le résumé
    el.startInput.value = startTrophies;
    el.startSummaryV.textContent  = startTrophies.toLocaleString('fr-FR') + ' 🏆';
    el.goalSummaryV.textContent   = (startTrophies + MONTHLY_GOAL).toLocaleString('fr-FR') + ' 🏆';
    el.startSummary.classList.remove('hidden');
    el.saveStartBtn.classList.add('hidden');
    el.startInput.disabled = true;
  } else {
    el.startSummary.classList.add('hidden');
    el.saveStartBtn.classList.remove('hidden');
    el.startInput.disabled = false;
    el.startInput.value = '';
  }
}

/* ──────────────────────────────────────────────
   RENDU : STATISTIQUES GLOBALES
────────────────────────────────────────────── */

function renderStats() {
  const completed = getCompletedDays();
  const gain      = getTotalGain();
  const current   = getCurrentTrophies();

  // Jours complétés
  el.statDays.textContent = `${completed} / ${TOTAL_DAYS}`;

  // Gain total
  if (gain !== null && completed > 0) {
    el.statGain.textContent = (gain >= 0 ? '+' : '') + gain.toLocaleString('fr-FR');
    el.statGain.style.color = gain >= MONTHLY_GOAL ? 'var(--green)' : 'var(--text-primary)';
  } else {
    el.statGain.textContent = '+0';
    el.statGain.style.color = '';
  }

  // Moyenne / jour
  if (completed > 0 && gain !== null) {
    const avg = Math.round(gain / completed);
    el.statAvg.textContent = (avg >= 0 ? '+' : '') + avg.toLocaleString('fr-FR');
    el.statAvg.style.color = avg >= DAILY_GOAL ? 'var(--green)' : 'var(--red)';
  } else {
    el.statAvg.textContent = '—';
    el.statAvg.style.color = '';
  }

  // Trophées actuels
  if (current !== null) {
    el.statCurrent.textContent = current.toLocaleString('fr-FR');
  } else {
    el.statCurrent.textContent = '—';
  }

  // Barre de progression (basée sur gain total vs objectif mensuel)
  const pct = gain !== null && MONTHLY_GOAL > 0
    ? Math.min(100, Math.max(0, Math.round((gain / MONTHLY_GOAL) * 100)))
    : 0;
  el.progressFill.style.width = pct + '%';
  el.progressLabel.textContent = pct + '%';
}

/* ──────────────────────────────────────────────
   RENDU : CALENDRIER DES 30 JOURS
────────────────────────────────────────────── */

function renderCalendar() {
  el.calendarList.innerHTML = '';

  for (let i = 0; i < TOTAL_DAYS; i++) {
    const dayNum  = i + 1;
    const val     = daysData[i];         // null ou entier
    const diff    = getDiff(i);          // null ou entier
    const isFilled = val !== null;
    const isLocked = startTrophies === null;

    // Détermine la classe de la ligne
    let rowClass = 'day-row';
    if (isFilled && diff !== null) {
      rowClass += diff >= DAILY_GOAL ? ' success' : ' fail';
    }

    // Icône statut
    let statusIcon = '⬜';
    if (isFilled && diff !== null) {
      statusIcon = diff >= DAILY_GOAL ? '✅' : '❌';
    }

    // Texte différence
    let diffText  = '';
    let diffClass = 'day-diff neutral';
    if (isFilled && diff !== null) {
      diffText  = (diff >= 0 ? '+' : '') + diff.toLocaleString('fr-FR');
      diffClass = 'day-diff ' + (diff >= DAILY_GOAL ? 'positive' : 'negative');
    }

    // Création de l'élément
    const row = document.createElement('div');
    row.className = rowClass;
    row.dataset.day = i;

    row.innerHTML = `
      <span class="day-status-icon">${statusIcon}</span>
      <span class="day-number">J${dayNum}</span>
      <input
        type="number"
        class="day-input"
        id="day-input-${i}"
        placeholder="Trophées J${dayNum}"
        value="${val !== null ? val : ''}"
        min="0"
        inputmode="numeric"
        ${isLocked ? 'disabled' : ''}
      />
      <span class="${diffClass}" id="day-diff-${i}">${diffText}</span>
      <button
        class="btn-validate"
        data-day="${i}"
        ${isLocked ? 'disabled' : ''}
        aria-label="Valider J${dayNum}"
      >OK</button>
    `;

    el.calendarList.appendChild(row);
  }

  // Attache les listeners sur les boutons "OK"
  el.calendarList.querySelectorAll('.btn-validate').forEach(btn => {
    btn.addEventListener('click', () => onValidateDay(parseInt(btn.dataset.day, 10)));
  });

  // Permet aussi de valider en appuyant sur Entrée dans le champ
  el.calendarList.querySelectorAll('.day-input').forEach((input, i) => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') onValidateDay(i);
    });
  });
}

/* ──────────────────────────────────────────────
   ACTION : VALIDER UN JOUR
────────────────────────────────────────────── */

function onValidateDay(dayIndex) {
  if (startTrophies === null) {
    showToast('⚠️ Configure d\'abord tes trophées de départ !', 'fail');
    return;
  }

  const input = $(`day-input-${dayIndex}`);
  const raw   = input.value.trim();

  if (raw === '') {
    showToast('⚠️ Saisis ton total de trophées pour ce jour.', 'fail');
    return;
  }

  const val = parseInt(raw, 10);

  if (isNaN(val) || val < 0) {
    showToast('❌ Valeur invalide.', 'fail');
    return;
  }

  // Vérification cohérence optionnelle : warn si très inférieur au départ
  if (val < startTrophies - 5000) {
    showToast('⚠️ Valeur très basse — vérifie ton saisie !', 'fail');
    // On laisse quand même sauvegarder
  }

  // Sauvegarde
  daysData[dayIndex] = val;
  saveDays();

  // Mise à jour de la ligne
  updateDayRow(dayIndex);

  // Mise à jour stats
  renderStats();

  // Bilan si J30 rempli
  renderBilan();

  // Animation
  const row = el.calendarList.querySelector(`[data-day="${dayIndex}"]`);
  if (row) {
    const parentRow = row.closest('.day-row');
    if (parentRow) {
      parentRow.classList.remove('just-saved');
      void parentRow.offsetWidth; // reflow pour relancer l'animation
      parentRow.classList.add('just-saved');
    }
  }

  // Toast
  const diff = getDiff(dayIndex);
  if (diff !== null) {
    if (diff >= DAILY_GOAL) {
      showToast(`✅ J${dayIndex + 1} validé · +${diff.toLocaleString('fr-FR')} 🏆`, 'success');
    } else {
      showToast(`❌ J${dayIndex + 1} validé · +${diff.toLocaleString('fr-FR')} (objectif non atteint)`, 'fail');
    }
  }
}

/* Met à jour visuellement une seule ligne du calendrier */
function updateDayRow(dayIndex) {
  const val  = daysData[dayIndex];
  const diff = getDiff(dayIndex);

  // Retrouve la ligne dans le DOM
  const rows = el.calendarList.querySelectorAll('.day-row');
  const row  = rows[dayIndex];
  if (!row) return;

  // Classe couleur
  row.classList.remove('success', 'fail');
  if (val !== null && diff !== null) {
    row.classList.add(diff >= DAILY_GOAL ? 'success' : 'fail');
  }

  // Icône
  const icon = row.querySelector('.day-status-icon');
  if (icon) {
    if (val !== null && diff !== null) {
      icon.textContent = diff >= DAILY_GOAL ? '✅' : '❌';
    } else {
      icon.textContent = '⬜';
    }
  }

  // Différence
  const diffEl = $(`day-diff-${dayIndex}`);
  if (diffEl && val !== null && diff !== null) {
    diffEl.textContent = (diff >= 0 ? '+' : '') + diff.toLocaleString('fr-FR');
    diffEl.className   = 'day-diff ' + (diff >= DAILY_GOAL ? 'positive' : 'negative');
  }
}

/* ──────────────────────────────────────────────
   RENDU : BILAN DE FIN DE MOIS
────────────────────────────────────────────── */

function renderBilan() {
  // N'affiche le bilan que si le jour 30 est rempli
  if (daysData[TOTAL_DAYS - 1] === null || startTrophies === null) {
    el.bilanSection.classList.add('hidden');
    return;
  }

  const gain      = getTotalGain();
  const isSuccess = gain >= MONTHLY_GOAL;
  const cls       = isSuccess ? 'success' : 'fail';
  const emoji     = isSuccess ? '🎉' : '😤';

  el.bilanSection.classList.remove('hidden');

  el.bilanBody.innerHTML = `
    <span class="bilan-emoji">${emoji}</span>
    <div class="bilan-result ${cls}">+${gain.toLocaleString('fr-FR')}</div>
    <div class="bilan-label ${cls}">
      ${isSuccess ? 'OBJECTIF ATTEINT !' : 'OBJECTIF NON ATTEINT'}
    </div>
    <div class="bilan-details">
      <div class="bilan-row">
        <span class="b-label">Trophées départ</span>
        <span class="b-value">${startTrophies.toLocaleString('fr-FR')} 🏆</span>
      </div>
      <div class="bilan-row">
        <span class="b-label">Trophées J30</span>
        <span class="b-value">${daysData[TOTAL_DAYS - 1].toLocaleString('fr-FR')} 🏆</span>
      </div>
      <div class="bilan-row">
        <span class="b-label">Gain total</span>
        <span class="b-value ${cls}">+${gain.toLocaleString('fr-FR')}</span>
      </div>
      <div class="bilan-row">
        <span class="b-label">Objectif</span>
        <span class="b-value">+${MONTHLY_GOAL.toLocaleString('fr-FR')}</span>
      </div>
      <div class="bilan-row">
        <span class="b-label">Écart objectif</span>
        <span class="b-value ${gain - MONTHLY_GOAL >= 0 ? 'success' : 'fail'}">
          ${gain - MONTHLY_GOAL >= 0 ? '+' : ''}${(gain - MONTHLY_GOAL).toLocaleString('fr-FR')}
        </span>
      </div>
      <div class="bilan-row">
        <span class="b-label">Jours réussis</span>
        <span class="b-value">${countSuccessDays()} / ${TOTAL_DAYS}</span>
      </div>
    </div>
  `;
}

/** Compte les jours où l'objectif journalier est atteint */
function countSuccessDays() {
  let count = 0;
  for (let i = 0; i < TOTAL_DAYS; i++) {
    const diff = getDiff(i);
    if (diff !== null && diff >= DAILY_GOAL) count++;
  }
  return count;
}

/* ──────────────────────────────────────────────
   TOAST
────────────────────────────────────────────── */

let toastTimer = null;

function showToast(message, type = 'info') {
  const t = el.toast;
  t.textContent = message;
  t.className   = `toast ${type}`;

  // Affiche
  t.classList.remove('hidden');
  // Forcer reflow
  void t.offsetWidth;
  t.classList.add('show');

  // Auto-hide après 2.5 s
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.classList.add('hidden'), 350);
  }, 2500);
}

/* ──────────────────────────────────────────────
   RESET
────────────────────────────────────────────── */

function resetAll() {
  localStorage.removeItem(LS_KEY_START);
  localStorage.removeItem(LS_KEY_DAYS);
  startTrophies = null;
  daysData      = new Array(TOTAL_DAYS).fill(null);
  renderAll();
  showToast('🔄 Données réinitialisées !', 'info');
}

/* ──────────────────────────────────────────────
   RENDU GLOBAL
────────────────────────────────────────────── */

function renderAll() {
  renderSetup();
  renderStats();
  renderCalendar();
  renderBilan();
}

/* ──────────────────────────────────────────────
   ÉVÉNEMENTS
────────────────────────────────────────────── */

/** Valider les trophées de départ */
el.saveStartBtn.addEventListener('click', () => {
  const raw = el.startInput.value.trim();
  if (raw === '') {
    showToast('⚠️ Entre ton nombre de trophées de départ.', 'fail');
    return;
  }
  const val = parseInt(raw, 10);
  if (isNaN(val) || val < 0) {
    showToast('❌ Valeur invalide.', 'fail');
    return;
  }
  startTrophies = val;
  saveStart();
  renderAll();
  showToast('✅ Trophées de départ sauvegardés !', 'success');
});

/** Modifier les trophées de départ */
el.editStartBtn.addEventListener('click', () => {
  el.startSummary.classList.add('hidden');
  el.saveStartBtn.classList.remove('hidden');
  el.startInput.disabled = false;
  el.startInput.focus();
});

/** Ouvrir la modal de reset */
el.resetBtn.addEventListener('click', () => {
  el.resetModal.classList.remove('hidden');
});

/** Annuler le reset */
el.cancelResetBtn.addEventListener('click', () => {
  el.resetModal.classList.add('hidden');
});

/** Confirmer le reset */
el.confirmResetBtn.addEventListener('click', () => {
  el.resetModal.classList.add('hidden');
  resetAll();
});

/** Fermer la modal en cliquant à l'extérieur */
el.resetModal.addEventListener('click', e => {
  if (e.target === el.resetModal) el.resetModal.classList.add('hidden');
});

/* ──────────────────────────────────────────────
   INITIALISATION
────────────────────────────────────────────── */

loadFromStorage();
renderAll();
