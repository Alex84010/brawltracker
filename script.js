/* ============================================================
   BRAWL STARS TROPHY TRACKER v2 — script.js

   ⚙️  CONFIGURATION : METS TON BEARER TOKEN CI-DESSOUS
   Génère-le sur : https://developer.brawlstars.com/
   ============================================================ */

const API_TOKEN = 'TON_BEARER_TOKEN_ICI';
// ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
// EXEMPLE : const API_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiIsImtpZCI6IjI4YTMxOGY3LTAwMDAtYTFlYi03ZmExLTJjNzQzM2M2Y2NhNSJ9.eyJpc3MiOiJzdXBlcmNlbGwiLCJhdWQiOiJzdXBlcmNlbGw6Z2FtZWFwaSIsImp0aSI6ImNmMjUwZTBjLTQ4YjgtNGQ3MC1hMzYzLWM2YjNhNTQ2ZmE0MiIsImlhdCI6MTcxODAwMDAwMCwic3ViIjoiZGV2ZWxvcGVyL2RlYWRiZWVmLTEyMzQtNTY3OC0xMjM0LTU2Nzg5MGFiY2RlZiIsInNjb3BlcyI6WyJicmF3bHN0YXJzIl0sImxpbWl0cyI6W119.xxxx';

/* ──────────────────────────────────────────────
   CONSTANTES
────────────────────────────────────────────── */
const TOTAL_DAYS   = 30;

/* Proxy CORS public gratuit — si corsproxy.io est indisponible,
   remplace par : 'https://api.allorigins.win/raw?url=' */
const CORS_PROXY   = 'https://corsproxy.io/?';
const BS_API_BASE  = 'https://api.brawlstars.com/v1/players/';

/* Clés localStorage */
const LS_CONFIG    = 'bs_v2_config';   // { playerTag, playerName, dailyGoal, startDate }
const LS_DAYS      = 'bs_v2_days';     // tableau de 30 entrées { trophies, date } ou null
const LS_START_TR  = 'bs_v2_start';    // trophées au J0 (avant J1)

/* ──────────────────────────────────────────────
   ÉTAT GLOBAL
────────────────────────────────────────────── */
let config     = null;   // { playerTag, playerName, dailyGoal, startDate (YYYY-MM-DD) }
let daysData   = [];     // 30 slots : null | { trophies: number, date: string }
let startTr    = null;   // trophées J0

/* ──────────────────────────────────────────────
   SÉLECTEURS DOM
────────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const el = {
  /* Setup */
  screenSetup:    $('screenSetup'),
  inputTag:       $('inputPlayerTag'),
  inputGoal:      $('inputDailyGoal'),
  btnStart:       $('btnStart'),
  btnStartLabel:  $('btnStartLabel'),
  setupLoader:    $('setupLoader'),

  /* Tracker */
  screenTracker:  $('screenTracker'),
  headerSub:      $('headerSub'),
  apiDot:         $('apiDot'),
  apiLabel:       $('apiLabel'),

  playerAvatar:   $('playerAvatar'),
  playerName:     $('playerName'),
  playerTag:      $('playerTag'),
  playerTrLive:   $('playerTrophiesLive'),
  lastSync:       $('lastSyncLabel'),
  btnRefresh:     $('btnRefresh'),

  statCurrentDay: $('statCurrentDay'),
  statDays:       $('statDaysCompleted'),
  statGain:       $('statTotalGain'),
  statAvg:        $('statAvgPerDay'),
  progressFill:   $('progressBarFill'),
  progressLabel:  $('progressBarLabel'),
  goalRecap:      $('goalRecapValue'),
  goalTotal:      $('goalTotalValue'),

  calendarList:   $('calendarList'),
  bilanSection:   $('bilanSection'),
  bilanBody:      $('bilanBody'),

  resetBtn:       $('resetBtn'),
  resetModal:     $('resetModal'),
  cancelReset:    $('cancelResetBtn'),
  confirmReset:   $('confirmResetBtn'),
  toast:          $('toast'),
};

/* ──────────────────────────────────────────────
   UTILITAIRES DATE
────────────────────────────────────────────── */

/** Retourne la date locale au format YYYY-MM-DD */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/** Différence en jours entre deux strings YYYY-MM-DD (b - a) */
function daysDiff(a, b) {
  const msA = new Date(a).setHours(0,0,0,0);
  const msB = new Date(b).setHours(0,0,0,0);
  return Math.round((msB - msA) / 86400000);
}

/** Formate YYYY-MM-DD → jj/mm */
function formatDate(str) {
  if (!str) return '—';
  const [, m, d] = str.split('-');
  return `${d}/${m}`;
}

/** Formate un timestamp en heure locale HH:MM */
function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

/* ──────────────────────────────────────────────
   LOCALSTORAGE
────────────────────────────────────────────── */

function loadStorage() {
  const c = localStorage.getItem(LS_CONFIG);
  const d = localStorage.getItem(LS_DAYS);
  const s = localStorage.getItem(LS_START_TR);

  config   = c ? JSON.parse(c) : null;
  daysData = d ? JSON.parse(d) : new Array(TOTAL_DAYS).fill(null);
  startTr  = s !== null ? parseInt(s, 10) : null;
}

function saveConfig()  { localStorage.setItem(LS_CONFIG,   JSON.stringify(config)); }
function saveDays()    { localStorage.setItem(LS_DAYS,     JSON.stringify(daysData)); }
function saveStartTr() { localStorage.setItem(LS_START_TR, startTr); }

function clearAll() {
  localStorage.removeItem(LS_CONFIG);
  localStorage.removeItem(LS_DAYS);
  localStorage.removeItem(LS_START_TR);
  config   = null;
  daysData = new Array(TOTAL_DAYS).fill(null);
  startTr  = null;
}

/* ──────────────────────────────────────────────
   API BRAWL STARS
────────────────────────────────────────────── */

/**
 * Récupère le profil du joueur via le proxy CORS.
 * @param {string} rawTag  — tag avec ou sans '#'
 * @returns {Promise<{trophies, name, tag}>}
 */
async function fetchPlayer(rawTag) {
  // Normalise le tag : retire '#', encode '%23' pour l'URL
  const clean   = rawTag.replace(/^#/, '').toUpperCase();
  const encoded = encodeURIComponent('#' + clean);
  const url     = `${CORS_PROXY}${BS_API_BASE}${encoded}`;

  const res = await fetch(url, {
    headers: {
      /* ⬇️  TON BEARER TOKEN EST UTILISÉ ICI ⬇️ */
      'Authorization': `Bearer ${API_TOKEN}`,
      'Accept':        'application/json',
    }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.reason || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return {
    trophies: data.trophies,
    name:     data.name,
    tag:      data.tag,
  };
}

/* ──────────────────────────────────────────────
   LOGIQUE : CALCUL DU JOUR ACTUEL DU DÉFI
────────────────────────────────────────────── */

/**
 * Retourne l'index (0-based) du jour du défi pour une date donnée.
 * Ex : si startDate = "2024-06-01" et today = "2024-06-03" → 2 (J3)
 * Retourne null si la date est avant le départ ou > J30.
 */
function getChallengeDay(dateStr) {
  if (!config) return null;
  const diff = daysDiff(config.startDate, dateStr);
  if (diff < 0 || diff >= TOTAL_DAYS) return null;
  return diff; // 0 = J1, 1 = J2 ...
}

/** Index 0-based du jour actuel du défi (-1 si hors défi) */
function getTodayIndex() {
  if (!config) return -1;
  const diff = daysDiff(config.startDate, todayStr());
  if (diff < 0 || diff >= TOTAL_DAYS) return diff >= TOTAL_DAYS ? TOTAL_DAYS - 1 : -1;
  return diff;
}

/* ──────────────────────────────────────────────
   LOGIQUE : ENREGISTREMENT AUTOMATIQUE
   Appelée à chaque ouverture et à chaque actualisation
────────────────────────────────────────────── */

/**
 * Vérifie si on a changé de jour depuis la dernière sync,
 * appelle l'API si nécessaire, enregistre les trophées du jour courant.
 * Laisse les jours "sautés" (manqués) à null.
 */
async function autoCheckAndUpdate() {
  if (!config) return;

  setApiStatus('loading', '🔄 Connexion…');

  let player;
  try {
    player = await fetchPlayer(config.playerTag);
  } catch (e) {
    setApiStatus('error', '❌ Erreur API');
    showToast(`❌ Erreur API : ${e.message}`, 'fail');
    return;
  }

  const todayIndex = getTodayIndex();

  // Met à jour le nom si modifié en jeu
  if (player.name !== config.playerName) {
    config.playerName = player.name;
    saveConfig();
  }

  // Enregistre les trophées pour le jour courant (si dans les 30 jours)
  if (todayIndex >= 0 && todayIndex < TOTAL_DAYS) {
    const today = todayStr();

    // Si ce jour n'a pas encore été enregistré AUJOURD'HUI
    const slot = daysData[todayIndex];
    const alreadySyncedToday = slot && slot.date === today;

    if (!alreadySyncedToday) {
      daysData[todayIndex] = {
        trophies:  player.trophies,
        date:      today,
        syncedAt:  Date.now(),
      };
      saveDays();
    } else {
      // Même jour : on met à jour les trophées (refresh manuel)
      daysData[todayIndex].trophies = player.trophies;
      daysData[todayIndex].syncedAt = Date.now();
      saveDays();
    }
  }

  // Mise à jour UI joueur
  updatePlayerUI(player);

  setApiStatus('ok', '✅ Sync OK');
  renderAll();
}

/* ──────────────────────────────────────────────
   UI : STATUT API
────────────────────────────────────────────── */

function setApiStatus(state, label) {
  el.apiDot.className   = `api-dot ${state}`;
  el.apiLabel.textContent = label;
}

/* ──────────────────────────────────────────────
   UI : JOUEUR
────────────────────────────────────────────── */

function updatePlayerUI(player) {
  el.playerName.textContent   = player.name;
  el.playerTag.textContent    = player.tag;
  el.playerTrLive.textContent = player.trophies.toLocaleString('fr-FR');
  el.playerAvatar.textContent = (player.name || '?')[0].toUpperCase();

  // Timestamp dernière sync
  const slot = daysData.find(d => d && d.syncedAt);
  let latestTs = 0;
  daysData.forEach(d => { if (d && d.syncedAt > latestTs) latestTs = d.syncedAt; });
  el.lastSync.textContent = latestTs
    ? `Dernière sync : aujourd'hui à ${formatTime(latestTs)}`
    : 'Dernière sync : jamais';
}

/* ──────────────────────────────────────────────
   CALCULS
────────────────────────────────────────────── */

function getPrevTrophies(dayIndex) {
  if (dayIndex === 0) return startTr;
  for (let i = dayIndex - 1; i >= 0; i--) {
    if (daysData[i]) return daysData[i].trophies;
  }
  return startTr;
}

function getDiff(dayIndex) {
  if (!daysData[dayIndex] || startTr === null) return null;
  const prev = getPrevTrophies(dayIndex);
  if (prev === null) return null;
  return daysData[dayIndex].trophies - prev;
}

function getCompletedDays() {
  return daysData.filter(d => d !== null).length;
}

function getTotalGain() {
  if (startTr === null) return null;
  for (let i = TOTAL_DAYS - 1; i >= 0; i--) {
    if (daysData[i]) return daysData[i].trophies - startTr;
  }
  return 0;
}

function countSuccessDays() {
  let n = 0;
  for (let i = 0; i < TOTAL_DAYS; i++) {
    const diff = getDiff(i);
    if (diff !== null && diff >= config.dailyGoal) n++;
  }
  return n;
}

/* ──────────────────────────────────────────────
   RENDU : STATS GLOBALES
────────────────────────────────────────────── */

function renderStats() {
  const todayIdx  = getTodayIndex();
  const completed = getCompletedDays();
  const gain      = getTotalGain();
  const goal      = config ? config.dailyGoal : 1000;
  const totalGoal = goal * TOTAL_DAYS;

  // Jour actuel
  el.statCurrentDay.textContent = todayIdx >= 0 ? `J${todayIdx + 1}` : '—';

  // Jours validés
  el.statDays.textContent = `${completed} / ${TOTAL_DAYS}`;

  // Gain total
  if (gain !== null && completed > 0) {
    el.statGain.textContent  = (gain >= 0 ? '+' : '') + gain.toLocaleString('fr-FR');
    el.statGain.style.color  = gain >= totalGoal ? 'var(--green)' : 'var(--text-primary)';
  } else {
    el.statGain.textContent = '+0';
    el.statGain.style.color = '';
  }

  // Moyenne journalière
  if (completed > 0 && gain !== null) {
    const avg = Math.round(gain / completed);
    el.statAvg.textContent = (avg >= 0 ? '+' : '') + avg.toLocaleString('fr-FR');
    el.statAvg.style.color = avg >= goal ? 'var(--green)' : 'var(--red)';
  } else {
    el.statAvg.textContent = '—';
    el.statAvg.style.color = '';
  }

  // Barre de progression
  const pct = gain !== null && totalGoal > 0
    ? Math.min(100, Math.max(0, Math.round((gain / totalGoal) * 100)))
    : 0;
  el.progressFill.style.width    = pct + '%';
  el.progressLabel.textContent   = pct + '%';

  // Récap objectif
  el.goalRecap.textContent = goal.toLocaleString('fr-FR');
  el.goalTotal.textContent = `+${totalGoal.toLocaleString('fr-FR')}`;
}

/* ──────────────────────────────────────────────
   RENDU : CALENDRIER
────────────────────────────────────────────── */

function renderCalendar() {
  const todayIdx = getTodayIndex();
  const goal     = config ? config.dailyGoal : 1000;

  el.calendarList.innerHTML = '';

  for (let i = 0; i < TOTAL_DAYS; i++) {
    const slot   = daysData[i];
    const diff   = getDiff(i);
    const isFilled  = slot !== null;
    const isToday   = i === todayIdx;
    const isFuture  = i > todayIdx && todayIdx >= 0;
    const isSkipped = !isFilled && i < todayIdx && todayIdx >= 0;

    // Classes de la ligne
    let rowClass = 'day-row';
    if (isFilled && diff !== null) {
      rowClass += diff >= goal ? ' success' : ' fail';
    }
    if (isToday)   rowClass += ' today';
    if (isSkipped) rowClass += ' skipped';

    // Icône
    let icon = '⬜';
    if (isFilled && diff !== null) icon = diff >= goal ? '✅' : '❌';
    else if (isToday)              icon = '📡';
    else if (isSkipped)            icon = '⏭️';
    else if (isFuture)             icon = '🔒';

    // Contenu central
    let mainHTML;
    if (isFilled) {
      mainHTML = `
        <div class="day-trophies">${slot.trophies.toLocaleString('fr-FR')} 🏆</div>
        <div class="day-date">${formatDate(slot.date)}</div>
      `;
    } else if (isToday) {
      mainHTML = `<div class="day-placeholder">En attente de sync…</div>`;
    } else if (isFuture) {
      mainHTML = `<div class="day-placeholder">À venir</div>`;
    } else if (isSkipped) {
      mainHTML = `<div class="day-placeholder">Jour manqué</div>`;
    } else {
      mainHTML = `<div class="day-placeholder">—</div>`;
    }

    // Badge différence
    let diffText  = '';
    let diffClass = 'day-diff neutral';
    if (isFilled && diff !== null) {
      diffText  = (diff >= 0 ? '+' : '') + diff.toLocaleString('fr-FR');
      diffClass = 'day-diff ' + (diff >= goal ? 'positive' : 'negative');
    }

    // Calcul de la date réelle du jour J(i+1)
    let dayDateStr = '';
    if (config && config.startDate) {
      const d = new Date(config.startDate);
      d.setDate(d.getDate() + i);
      dayDateStr = formatDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
    }

    const row = document.createElement('div');
    row.className   = rowClass;
    row.dataset.day = i;
    row.innerHTML   = `
      <span class="day-status-icon">${icon}</span>
      <span class="day-number">J${i + 1}${dayDateStr ? `<br><small style="font-size:9px;color:var(--text-muted);font-weight:600">${dayDateStr}</small>` : ''}</span>
      <div class="day-main">${mainHTML}</div>
      <span class="${diffClass}">${diffText}</span>
    `;

    el.calendarList.appendChild(row);
  }
}

/* ──────────────────────────────────────────────
   RENDU : BILAN DE FIN DE MOIS
────────────────────────────────────────────── */

function renderBilan() {
  if (!config || startTr === null) {
    el.bilanSection.classList.add('hidden');
    return;
  }

  // N'affiche que si J30 est rempli
  if (!daysData[TOTAL_DAYS - 1]) {
    el.bilanSection.classList.add('hidden');
    return;
  }

  const gain      = getTotalGain();
  const goal      = config.dailyGoal;
  const totalGoal = goal * TOTAL_DAYS;
  const isSuccess = gain >= totalGoal;
  const cls       = isSuccess ? 'success' : 'fail';

  el.bilanSection.classList.remove('hidden');

  el.bilanBody.innerHTML = `
    <span class="bilan-emoji">${isSuccess ? '🎉' : '😤'}</span>
    <div class="bilan-result ${cls}">${gain >= 0 ? '+' : ''}${gain.toLocaleString('fr-FR')}</div>
    <div class="bilan-label ${cls}">${isSuccess ? 'OBJECTIF ATTEINT !' : 'OBJECTIF NON ATTEINT'}</div>
    <div class="bilan-details">
      <div class="bilan-row">
        <span class="b-label">Trophées départ</span>
        <span class="b-value">${startTr.toLocaleString('fr-FR')} 🏆</span>
      </div>
      <div class="bilan-row">
        <span class="b-label">Trophées J30</span>
        <span class="b-value">${daysData[TOTAL_DAYS-1].trophies.toLocaleString('fr-FR')} 🏆</span>
      </div>
      <div class="bilan-row">
        <span class="b-label">Gain total</span>
        <span class="b-value ${cls}">${gain >= 0 ? '+' : ''}${gain.toLocaleString('fr-FR')}</span>
      </div>
      <div class="bilan-row">
        <span class="b-label">Objectif visé</span>
        <span class="b-value">+${totalGoal.toLocaleString('fr-FR')}</span>
      </div>
      <div class="bilan-row">
        <span class="b-label">Écart</span>
        <span class="b-value ${(gain - totalGoal) >= 0 ? 'success' : 'fail'}">
          ${(gain - totalGoal) >= 0 ? '+' : ''}${(gain - totalGoal).toLocaleString('fr-FR')}
        </span>
      </div>
      <div class="bilan-row">
        <span class="b-label">Jours réussis</span>
        <span class="b-value">${countSuccessDays()} / ${TOTAL_DAYS}</span>
      </div>
    </div>
  `;
}

/* ──────────────────────────────────────────────
   RENDU GLOBAL
────────────────────────────────────────────── */

function renderAll() {
  renderStats();
  renderCalendar();
  renderBilan();
}

/* ──────────────────────────────────────────────
   AFFICHAGE DES ÉCRANS
────────────────────────────────────────────── */

function showScreen(name) {
  el.screenSetup.classList.toggle('hidden',   name !== 'setup');
  el.screenTracker.classList.toggle('hidden', name !== 'tracker');
}

/* ──────────────────────────────────────────────
   TOAST
────────────────────────────────────────────── */

let toastTimer = null;

function showToast(msg, type = 'info') {
  const t = el.toast;
  t.textContent = msg;
  t.className   = `toast ${type}`;
  t.classList.remove('hidden');
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.classList.add('hidden'), 350);
  }, 2800);
}

/* ──────────────────────────────────────────────
   ACTION : DÉMARRER LE DÉFI
────────────────────────────────────────────── */

async function onStartChallenge() {
  const rawTag  = el.inputTag.value.trim();
  const goalStr = el.inputGoal.value.trim();

  // Validations
  if (!rawTag) {
    showToast('⚠️ Entre ton tag joueur.', 'fail'); return;
  }
  const goal = parseInt(goalStr, 10) || 1000;
  if (goal < 1) {
    showToast('⚠️ Objectif invalide.', 'fail'); return;
  }
  if (API_TOKEN === 'TON_BEARER_TOKEN_ICI' || API_TOKEN.trim() === '') {
    showToast('🔑 Configure ton Bearer Token dans script.js !', 'fail'); return;
  }

  // UI : loading
  el.btnStart.disabled        = true;
  el.btnStartLabel.textContent = '⏳ Connexion…';
  el.setupLoader.classList.remove('hidden');
  setApiStatus('loading', '🔄 Connexion…');

  let player;
  try {
    player = await fetchPlayer(rawTag);
  } catch (e) {
    el.btnStart.disabled        = false;
    el.btnStartLabel.textContent = '🚀 Démarrer le défi';
    el.setupLoader.classList.add('hidden');
    setApiStatus('error', '❌ Erreur API');
    showToast(`❌ ${e.message}`, 'fail');
    return;
  }

  // Initialise la config
  config = {
    playerTag:  player.tag,
    playerName: player.name,
    dailyGoal:  goal,
    startDate:  todayStr(),        // Aujourd'hui = début du défi
  };
  saveConfig();

  // Trophées de départ = trophées actuels AVANT J1
  startTr = player.trophies;
  saveStartTr();

  // Initialise le tableau des 30 jours
  daysData = new Array(TOTAL_DAYS).fill(null);
  // J1 = aujourd'hui → on enregistre d'emblée
  daysData[0] = {
    trophies: player.trophies,
    date:     todayStr(),
    syncedAt: Date.now(),
  };
  saveDays();

  setApiStatus('ok', '✅ Défi lancé !');
  el.setupLoader.classList.add('hidden');

  // Affiche l'écran tracker
  showScreen('tracker');
  updatePlayerUI(player);
  el.headerSub.textContent = `${config.playerName} · Défi 30 Jours`;
  renderAll();
  showToast(`🚀 Défi lancé ! Départ : ${player.trophies.toLocaleString('fr-FR')} 🏆`, 'success');
}

/* ──────────────────────────────────────────────
   ACTION : ACTUALISER MANUELLEMENT
────────────────────────────────────────────── */

async function onRefresh() {
  el.btnRefresh.disabled = true;
  await autoCheckAndUpdate();
  el.btnRefresh.disabled = false;
  showToast('🔄 Données actualisées !', 'info');
}

/* ──────────────────────────────────────────────
   ACTION : RESET
────────────────────────────────────────────── */

function onReset() {
  clearAll();
  showScreen('setup');
  setApiStatus('', 'En attente');
  el.apiDot.className = 'api-dot';
  el.inputTag.value   = '';
  el.inputGoal.value  = '1000';
  el.btnStart.disabled        = false;
  el.btnStartLabel.textContent = '🚀 Démarrer le défi';
  showToast('🔄 Mois réinitialisé !', 'info');
}

/* ──────────────────────────────────────────────
   INITIALISATION PRINCIPALE
────────────────────────────────────────────── */

async function init() {
  loadStorage();

  if (!config) {
    // Premier lancement → écran de config
    showScreen('setup');
    return;
  }

  // Défi en cours → affiche directement le tracker
  showScreen('tracker');
  el.headerSub.textContent = `${config.playerName} · Défi 30 Jours`;

  // Rendu immédiat avec les données locales (pas de blanc)
  renderAll();

  // Vérification auto : a-t-on changé de jour depuis la dernière sync ?
  const todayIdx   = getTodayIndex();
  const slot       = todayIdx >= 0 ? daysData[todayIdx] : null;
  const alreadyToday = slot && slot.date === todayStr();

  if (!alreadyToday) {
    // Nouveau jour détecté → appel API silencieux en arrière-plan
    showToast('📡 Nouveau jour détecté — synchronisation…', 'info');
    await autoCheckAndUpdate();
  } else {
    // Même jour, affiche juste le profil depuis le cache
    const cached = {
      trophies: slot.trophies,
      name:     config.playerName,
      tag:      config.playerTag,
    };
    updatePlayerUI(cached);
    setApiStatus('ok', '✅ À jour');
  }
}

/* ──────────────────────────────────────────────
   ÉCOUTEURS D'ÉVÉNEMENTS
────────────────────────────────────────────── */

el.btnStart.addEventListener('click', onStartChallenge);
el.btnRefresh.addEventListener('click', onRefresh);

el.resetBtn.addEventListener('click', () => {
  el.resetModal.classList.remove('hidden');
});
el.cancelReset.addEventListener('click', () => {
  el.resetModal.classList.add('hidden');
});
el.confirmReset.addEventListener('click', () => {
  el.resetModal.classList.add('hidden');
  onReset();
});
el.resetModal.addEventListener('click', e => {
  if (e.target === el.resetModal) el.resetModal.classList.add('hidden');
});

/* ── Lancement ── */
init();
