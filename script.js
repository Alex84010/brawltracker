/* ============================================================
   BRAWL STARS TROPHY TRACKER v3 — script.js

   ✅ ZÉRO CLÉ API — ZÉRO CONFIG IP
   Source : api.brawlapi.com (API non-officielle publique par Brawlify)
   Endpoint : https://api.brawlapi.com/v1/players/{TAG}
   Réponse JSON : { tag, name, trophies, ... }

   Proxy CORS requis depuis Android WebView (pas de CORS natif).
   On tente plusieurs proxies en cascade — si l'un échoue, on passe au suivant.
   ============================================================ */

'use strict';

/* ──────────────────────────────────────────────
   CONFIGURATION PROXIES (ordre de priorité)
   Si corsproxy.io est down, on tente les suivants.
────────────────────────────────────────────── */
const CORS_PROXIES = [
  'https://corsproxy.io/?',                         // Proxy 1 (le plus fiable)
  'https://api.allorigins.win/raw?url=',            // Proxy 2 (fallback)
  'https://thingproxy.freeboard.io/fetch/',         // Proxy 3 (fallback)
];

/* API publique Brawlify — aucune clé requise */
const BRAWLAPI_BASE = 'https://api.brawlapi.com/v1/players/';

/* ──────────────────────────────────────────────
   CONSTANTES
────────────────────────────────────────────── */
const TOTAL_DAYS = 30;

/* Clés localStorage */
const LS_CONFIG   = 'bs_v3_config';   // { playerTag, playerName, dailyGoal, startDate }
const LS_DAYS     = 'bs_v3_days';     // tableau 30 slots : null | { trophies, date, syncedAt }
const LS_START_TR = 'bs_v3_start';    // trophées J0 (base de départ)

/* ──────────────────────────────────────────────
   ÉTAT GLOBAL
────────────────────────────────────────────── */
let config   = null;  // { playerTag, playerName, dailyGoal, startDate }
let daysData = [];    // 30 slots
let startTr  = null;  // trophées J0

/* ──────────────────────────────────────────────
   SÉLECTEURS DOM
────────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const el = {
  screenSetup:   $('screenSetup'),
  inputTag:      $('inputPlayerTag'),
  inputGoal:     $('inputDailyGoal'),
  btnStart:      $('btnStart'),
  btnStartLabel: $('btnStartLabel'),
  setupLoader:   $('setupLoader'),

  screenTracker: $('screenTracker'),
  headerSub:     $('headerSub'),
  apiDot:        $('apiDot'),
  apiLabel:      $('apiLabel'),

  playerAvatar:  $('playerAvatar'),
  playerName:    $('playerName'),
  playerTag:     $('playerTag'),
  playerTrLive:  $('playerTrophiesLive'),
  lastSync:      $('lastSyncLabel'),
  btnRefresh:    $('btnRefresh'),

  statCurrentDay:$('statCurrentDay'),
  statDays:      $('statDaysCompleted'),
  statGain:      $('statTotalGain'),
  statAvg:       $('statAvgPerDay'),
  progressFill:  $('progressBarFill'),
  progressLabel: $('progressBarLabel'),
  goalRecap:     $('goalRecapValue'),
  goalTotal:     $('goalTotalValue'),

  calendarList:  $('calendarList'),
  bilanSection:  $('bilanSection'),
  bilanBody:     $('bilanBody'),

  resetBtn:      $('resetBtn'),
  resetModal:    $('resetModal'),
  cancelReset:   $('cancelResetBtn'),
  confirmReset:  $('confirmResetBtn'),
  toast:         $('toast'),
};

/* ──────────────────────────────────────────────
   UTILITAIRES DATE
────────────────────────────────────────────── */

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function daysDiff(a, b) {
  return Math.round((new Date(b).setHours(0,0,0,0) - new Date(a).setHours(0,0,0,0)) / 86400000);
}

function formatDate(str) {
  if (!str) return '—';
  const [, m, d] = str.split('-');
  return `${d}/${m}`;
}

function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
function saveStartTr() { localStorage.setItem(LS_START_TR, String(startTr)); }

function clearAll() {
  [LS_CONFIG, LS_DAYS, LS_START_TR].forEach(k => localStorage.removeItem(k));
  config = null; daysData = new Array(TOTAL_DAYS).fill(null); startTr = null;
}

/* ──────────────────────────────────────────────
   API BRAWLAPI — FETCH AVEC FALLBACK MULTI-PROXY

   Endpoint : GET https://api.brawlapi.com/v1/players/{%23TAG}
   Réponse  : { "tag":"#XXXXXX", "name":"NomJoueur", "trophies":12345, ... }
   Aucun header Authorization requis.
────────────────────────────────────────────── */

/**
 * Tente de récupérer le profil joueur via les proxies CORS dans l'ordre.
 * @param {string} rawTag — avec ou sans '#'
 * @returns {Promise<{trophies, name, tag}>}
 */
async function fetchPlayer(rawTag) {
  /* Normalise : retire '#', remet-le encodé pour l'URL */
  const clean      = rawTag.replace(/^#/, '').toUpperCase();
  const encodedTag = encodeURIComponent('#' + clean);
  const targetUrl  = `${BRAWLAPI_BASE}${encodedTag}`;

  let lastError = null;

  for (let i = 0; i < CORS_PROXIES.length; i++) {
    const proxyUrl = `${CORS_PROXIES[i]}${targetUrl}`;
    try {
      const res = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          /* ✅ Aucun Bearer Token — api.brawlapi.com est public */
          'Accept': 'application/json',
          /* User-Agent utile pour certains proxies */
          'User-Agent': 'BSTrophyTracker/3.0',
        },
      });

      if (!res.ok) {
        /* HTTP 404 = tag invalide, inutile d'essayer d'autres proxies */
        if (res.status === 404) {
          throw new Error('Tag introuvable (404). Vérifie ton tag joueur.');
        }
        throw new Error(`HTTP ${res.status} via proxy ${i + 1}`);
      }

      const data = await res.json();

      /* Vérifie que la réponse contient bien les trophées */
      if (typeof data.trophies !== 'number') {
        throw new Error('Réponse inattendue de l\'API.');
      }

      return {
        trophies: data.trophies,
        name:     data.name || 'Joueur',
        tag:      data.tag  || ('#' + clean),
      };

    } catch (err) {
      lastError = err;
      /* Si c'est un 404 (tag invalide), on arrête immédiatement */
      if (err.message.includes('404')) throw err;
      /* Sinon on tente le proxy suivant */
      console.warn(`Proxy ${i + 1} échoué : ${err.message}`);
    }
  }

  /* Tous les proxies ont échoué */
  throw new Error(`Tous les proxies ont échoué. Vérifie ta connexion.\nDétail : ${lastError?.message}`);
}

/* ──────────────────────────────────────────────
   LOGIQUE : JOURS DU DÉFI
────────────────────────────────────────────── */

function getTodayIndex() {
  if (!config) return -1;
  const diff = daysDiff(config.startDate, todayStr());
  if (diff < 0) return -1;
  if (diff >= TOTAL_DAYS) return TOTAL_DAYS - 1;
  return diff;
}

/* ──────────────────────────────────────────────
   LOGIQUE : AUTO-SYNC À L'OUVERTURE
   → Appelée au démarrage et sur bouton "Actualiser"
────────────────────────────────────────────── */

async function autoCheckAndUpdate() {
  if (!config) return;
  setApiStatus('loading', '🔄 Synchro…');

  let player;
  try {
    player = await fetchPlayer(config.playerTag);
  } catch (e) {
    setApiStatus('error', '❌ Erreur réseau');
    showToast(`❌ ${e.message}`, 'fail');
    return;
  }

  /* Met à jour le nom si changé in-game */
  if (player.name !== config.playerName) {
    config.playerName = player.name;
    saveConfig();
  }

  const idx   = getTodayIndex();
  const today = todayStr();

  if (idx >= 0 && idx < TOTAL_DAYS) {
    const slot             = daysData[idx];
    const alreadyToday     = slot && slot.date === today;

    if (!alreadyToday) {
      /* Nouveau jour → enregistre le snapshot */
      daysData[idx] = { trophies: player.trophies, date: today, syncedAt: Date.now() };
    } else {
      /* Même jour → met à jour les trophées (refresh manuel) */
      daysData[idx].trophies = player.trophies;
      daysData[idx].syncedAt = Date.now();
    }
    saveDays();
  }

  updatePlayerUI(player);
  setApiStatus('ok', '✅ À jour');
  renderAll();
}

/* ──────────────────────────────────────────────
   UI : STATUT API (point coloré dans le header)
────────────────────────────────────────────── */

function setApiStatus(state, label) {
  el.apiDot.className  = `api-dot ${state}`;
  el.apiLabel.textContent = label;
}

/* ──────────────────────────────────────────────
   UI : CARTE JOUEUR
────────────────────────────────────────────── */

function updatePlayerUI(player) {
  el.playerName.textContent  = player.name;
  el.playerTag.textContent   = player.tag;
  el.playerTrLive.textContent= player.trophies.toLocaleString('fr-FR');
  el.playerAvatar.textContent= (player.name || '?')[0].toUpperCase();

  /* Timestamp de la dernière sync */
  let latestTs = 0;
  daysData.forEach(d => { if (d && d.syncedAt > latestTs) latestTs = d.syncedAt; });
  el.lastSync.textContent = latestTs
    ? `Dernière sync : aujourd'hui à ${formatTime(latestTs)}`
    : 'Dernière sync : jamais';
}

/* ──────────────────────────────────────────────
   CALCULS
────────────────────────────────────────────── */

function getPrevTrophies(i) {
  if (i === 0) return startTr;
  for (let j = i - 1; j >= 0; j--) {
    if (daysData[j]) return daysData[j].trophies;
  }
  return startTr;
}

function getDiff(i) {
  if (!daysData[i] || startTr === null) return null;
  const prev = getPrevTrophies(i);
  return prev === null ? null : daysData[i].trophies - prev;
}

function getTotalGain() {
  if (startTr === null) return null;
  for (let i = TOTAL_DAYS - 1; i >= 0; i--) {
    if (daysData[i]) return daysData[i].trophies - startTr;
  }
  return 0;
}

function countSuccessDays() {
  const goal = config?.dailyGoal ?? 1000;
  return daysData.reduce((n, _, i) => {
    const d = getDiff(i);
    return n + (d !== null && d >= goal ? 1 : 0);
  }, 0);
}

/* ──────────────────────────────────────────────
   RENDU : STATS GLOBALES
────────────────────────────────────────────── */

function renderStats() {
  const todayIdx  = getTodayIndex();
  const completed = daysData.filter(d => d !== null).length;
  const gain      = getTotalGain();
  const goal      = config?.dailyGoal ?? 1000;
  const totalGoal = goal * TOTAL_DAYS;

  el.statCurrentDay.textContent = todayIdx >= 0 ? `J${todayIdx + 1}` : '—';
  el.statDays.textContent       = `${completed} / ${TOTAL_DAYS}`;

  if (gain !== null && completed > 0) {
    el.statGain.textContent = (gain >= 0 ? '+' : '') + gain.toLocaleString('fr-FR');
    el.statGain.style.color = gain >= totalGoal ? 'var(--green)' : 'var(--text-primary)';
  } else {
    el.statGain.textContent = '+0';
    el.statGain.style.color = '';
  }

  if (completed > 0 && gain !== null) {
    const avg = Math.round(gain / completed);
    el.statAvg.textContent = (avg >= 0 ? '+' : '') + avg.toLocaleString('fr-FR');
    el.statAvg.style.color = avg >= goal ? 'var(--green)' : 'var(--red)';
  } else {
    el.statAvg.textContent = '—';
    el.statAvg.style.color = '';
  }

  const pct = gain !== null && totalGoal > 0
    ? Math.min(100, Math.max(0, Math.round((gain / totalGoal) * 100))) : 0;
  el.progressFill.style.width  = `${pct}%`;
  el.progressLabel.textContent = `${pct}%`;
  el.goalRecap.textContent     = goal.toLocaleString('fr-FR');
  el.goalTotal.textContent     = `+${totalGoal.toLocaleString('fr-FR')}`;
}

/* ──────────────────────────────────────────────
   RENDU : CALENDRIER 30 JOURS
────────────────────────────────────────────── */

function renderCalendar() {
  const todayIdx = getTodayIndex();
  const goal     = config?.dailyGoal ?? 1000;
  el.calendarList.innerHTML = '';

  for (let i = 0; i < TOTAL_DAYS; i++) {
    const slot     = daysData[i];
    const diff     = getDiff(i);
    const filled   = slot !== null;
    const isToday  = i === todayIdx;
    const isFuture = todayIdx >= 0 && i > todayIdx;
    const skipped  = !filled && todayIdx >= 0 && i < todayIdx;

    /* ── Classes de ligne ── */
    let cls = 'day-row';
    if (filled && diff !== null) cls += diff >= goal ? ' success' : ' fail';
    if (isToday)  cls += ' today';
    if (skipped)  cls += ' skipped';

    /* ── Icône statut ── */
    let icon = '⬜';
    if (filled && diff !== null) icon = diff >= goal ? '✅' : '❌';
    else if (isToday)  icon = '📡';
    else if (skipped)  icon = '⏭️';
    else if (isFuture) icon = '🔒';

    /* ── Contenu central ── */
    let mainHTML;
    if (filled) {
      mainHTML = `
        <div class="day-trophies">${slot.trophies.toLocaleString('fr-FR')} 🏆</div>
        <div class="day-date">${formatDate(slot.date)}</div>`;
    } else if (isToday) {
      mainHTML = `<div class="day-placeholder">En attente de sync…</div>`;
    } else if (isFuture) {
      mainHTML = `<div class="day-placeholder">À venir</div>`;
    } else if (skipped) {
      mainHTML = `<div class="day-placeholder">Jour manqué</div>`;
    } else {
      mainHTML = `<div class="day-placeholder">—</div>`;
    }

    /* ── Badge différence ── */
    let diffText = '', diffCls = 'day-diff neutral';
    if (filled && diff !== null) {
      diffText = (diff >= 0 ? '+' : '') + diff.toLocaleString('fr-FR');
      diffCls  = `day-diff ${diff >= goal ? 'positive' : 'negative'}`;
    }

    /* ── Date calendaire du jour ── */
    let calDate = '';
    if (config?.startDate) {
      const d = new Date(config.startDate);
      d.setDate(d.getDate() + i);
      calDate = `<small style="font-size:9px;color:var(--text-muted);font-weight:600;display:block;margin-top:2px">${formatDate(d.toISOString().split('T')[0])}</small>`;
    }

    const row = document.createElement('div');
    row.className   = cls;
    row.dataset.day = i;
    row.innerHTML   = `
      <span class="day-status-icon">${icon}</span>
      <span class="day-number">J${i + 1}${calDate}</span>
      <div class="day-main">${mainHTML}</div>
      <span class="${diffCls}">${diffText}</span>
    `;
    el.calendarList.appendChild(row);
  }
}

/* ──────────────────────────────────────────────
   RENDU : BILAN DE FIN DE MOIS
────────────────────────────────────────────── */

function renderBilan() {
  if (!config || startTr === null || !daysData[TOTAL_DAYS - 1]) {
    el.bilanSection.classList.add('hidden');
    return;
  }

  const gain      = getTotalGain();
  const goal      = config.dailyGoal;
  const totalGoal = goal * TOTAL_DAYS;
  const ok        = gain >= totalGoal;
  const cls       = ok ? 'success' : 'fail';

  el.bilanSection.classList.remove('hidden');
  el.bilanBody.innerHTML = `
    <span class="bilan-emoji">${ok ? '🎉' : '😤'}</span>
    <div class="bilan-result ${cls}">${gain >= 0 ? '+' : ''}${gain.toLocaleString('fr-FR')}</div>
    <div class="bilan-label ${cls}">${ok ? 'OBJECTIF ATTEINT !' : 'OBJECTIF NON ATTEINT'}</div>
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
    </div>`;
}

/* ──────────────────────────────────────────────
   RENDU GLOBAL
────────────────────────────────────────────── */

function renderAll() { renderStats(); renderCalendar(); renderBilan(); }

/* ──────────────────────────────────────────────
   NAVIGATION ÉCRANS
────────────────────────────────────────────── */

function showScreen(name) {
  el.screenSetup.classList.toggle('hidden',   name !== 'setup');
  el.screenTracker.classList.toggle('hidden', name !== 'tracker');
}

/* ──────────────────────────────────────────────
   TOAST
────────────────────────────────────────────── */

let _toastTimer = null;
function showToast(msg, type = 'info') {
  const t = el.toast;
  t.textContent = msg;
  t.className   = `toast ${type}`;
  t.classList.remove('hidden');
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.classList.add('hidden'), 350);
  }, 3000);
}

/* ──────────────────────────────────────────────
   ACTION : DÉMARRER LE DÉFI
────────────────────────────────────────────── */

async function onStartChallenge() {
  const rawTag = el.inputTag.value.trim();
  const goal   = parseInt(el.inputGoal.value.trim(), 10) || 1000;

  if (!rawTag) { showToast('⚠️ Entre ton tag joueur.', 'fail'); return; }
  if (goal < 1) { showToast('⚠️ Objectif invalide.', 'fail'); return; }

  /* Retire les caractères interdits d'un tag (garde lettres+chiffres) */
  const cleanTag = rawTag.replace(/[^A-Z0-9a-z]/g, '').toUpperCase();
  if (cleanTag.length < 3) {
    showToast('⚠️ Tag trop court. Ex : 2PP', 'fail'); return;
  }

  /* UI loading */
  el.btnStart.disabled        = true;
  el.btnStartLabel.textContent = '⏳ Connexion…';
  el.setupLoader.classList.remove('hidden');
  setApiStatus('loading', '🔄 Connexion…');

  let player;
  try {
    player = await fetchPlayer(cleanTag);
  } catch (e) {
    el.btnStart.disabled        = false;
    el.btnStartLabel.textContent = '🚀 Démarrer le défi';
    el.setupLoader.classList.add('hidden');
    setApiStatus('error', '❌ Échec');
    showToast(`❌ ${e.message}`, 'fail');
    return;
  }

  /* Initialise la config */
  config = { playerTag: player.tag, playerName: player.name, dailyGoal: goal, startDate: todayStr() };
  saveConfig();

  /* Trophées J0 = snapshot avant le défi */
  startTr = player.trophies;
  saveStartTr();

  /* Initialise les 30 jours — enregistre J1 d'emblée */
  daysData    = new Array(TOTAL_DAYS).fill(null);
  daysData[0] = { trophies: player.trophies, date: todayStr(), syncedAt: Date.now() };
  saveDays();

  /* Affiche l'écran tracker */
  el.setupLoader.classList.add('hidden');
  setApiStatus('ok', '✅ Défi lancé !');
  showScreen('tracker');
  el.headerSub.textContent = `${player.name} · Défi 30 Jours`;
  updatePlayerUI(player);
  renderAll();
  showToast(`🚀 Défi lancé ! Départ : ${player.trophies.toLocaleString('fr-FR')} 🏆`, 'success');
}

/* ──────────────────────────────────────────────
   ACTION : ACTUALISER
────────────────────────────────────────────── */

async function onRefresh() {
  el.btnRefresh.disabled = true;
  await autoCheckAndUpdate();
  el.btnRefresh.disabled = false;
}

/* ──────────────────────────────────────────────
   ACTION : RESET
────────────────────────────────────────────── */

function onReset() {
  clearAll();
  showScreen('setup');
  el.apiDot.className  = 'api-dot';
  el.apiLabel.textContent = 'En attente';
  el.inputTag.value    = '';
  el.inputGoal.value   = '1000';
  el.btnStart.disabled         = false;
  el.btnStartLabel.textContent = '🚀 Démarrer le défi';
  showToast('🔄 Mois réinitialisé.', 'info');
}

/* ──────────────────────────────────────────────
   INITIALISATION
────────────────────────────────────────────── */

async function init() {
  loadStorage();

  if (!config) {
    /* Premier lancement : écran de configuration */
    showScreen('setup');
    return;
  }

  /* Défi actif : affiche le tracker immédiatement avec les données locales */
  showScreen('tracker');
  el.headerSub.textContent = `${config.playerName} · Défi 30 Jours`;
  renderAll();

  /* Vérifie si on a changé de jour → synchro auto si besoin */
  const idx          = getTodayIndex();
  const slot         = idx >= 0 ? daysData[idx] : null;
  const alreadyToday = slot && slot.date === todayStr();

  if (!alreadyToday) {
    showToast('📡 Nouveau jour — synchronisation…', 'info');
    await autoCheckAndUpdate();
  } else {
    /* Même jour : affiche le cache directement, sans appel réseau */
    updatePlayerUI({ trophies: slot.trophies, name: config.playerName, tag: config.playerTag });
    setApiStatus('ok', '✅ Données en cache');
  }
}

/* ──────────────────────────────────────────────
   ÉVÉNEMENTS
────────────────────────────────────────────── */

el.btnStart.addEventListener('click', onStartChallenge);
el.btnRefresh.addEventListener('click', onRefresh);
el.resetBtn.addEventListener('click', () => el.resetModal.classList.remove('hidden'));
el.cancelReset.addEventListener('click', () => el.resetModal.classList.add('hidden'));
el.confirmReset.addEventListener('click', () => { el.resetModal.classList.add('hidden'); onReset(); });
el.resetModal.addEventListener('click', e => { if (e.target === el.resetModal) el.resetModal.classList.add('hidden'); });

/* ── Lancement ── */
init();
