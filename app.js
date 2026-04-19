/**
 * @fileoverview Smart Stadium Experience — Main Application
 * @version 2.0.0
 * @description Real-time crowd management, live match tracking, digital ticketing,
 * transit coordination and emergency assistance for stadium attendees.
 */
'use strict';

/** @constant {Object} APP_CONFIG */
const APP_CONFIG = {
  UPDATE_INTERVAL: 5000,
  CROWD_INTERVAL: 10000,
  TOAST_DURATION: 4000,
  SOS_COOLDOWN: 30000,
  STORAGE_KEYS: { PROFILE: 'ss_profile', HISTORY: 'ss_history', PREFS: 'ss_prefs' }
};

/** @constant {Object} MATCH_CONFIG */
const MATCH_CONFIG = {
  HOME: { name: 'Royal Challengers Bengaluru', short: 'RCB' },
  AWAY: { name: 'Chennai Super Kings', short: 'CSK' },
  TARGET: 196,
  OUTCOMES: ['0','0','1','1','1','2','4','4','6','W']
};

/** @constant {Object} ZONES */
const ZONES = {
  'North Stand': { capacity: 5000, gate: 1 },
  'East Stand': { capacity: 8000, gate: 2 },
  'South Pavilion': { capacity: 6000, gate: 3 },
  'West Gallery': { capacity: 7000, gate: 4 },
  'Corporate Box': { capacity: 2000, gate: 5 }
};

/** @constant {Array} FACILITIES */
const FACILITIES = [
  { name: 'Food Court A', icon: 'utensils', base: 10 },
  { name: 'Restroom Block B', icon: 'restroom', base: 4 },
  { name: 'Merchandise Shop', icon: 'store', base: 7 },
  { name: 'First Aid Station', icon: 'kit-medical', base: 2 }
];

/* ===================== UTILITIES ===================== */

/** @namespace SecurityUtils */
const SecurityUtils = {
  /** @param {string} t @returns {string} */
  sanitize(t) {
    if (typeof t !== 'string') { return ''; }
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
  },
  /** @param {*} v @param {number} min @param {number} max @returns {number|null} */
  validateNum(v, min = 0, max = Infinity) {
    const n = Number(v);
    return (Number.isNaN(n) || !Number.isFinite(n) || n < min || n > max) ? null : n;
  },
  /** @param {string} action @param {number} ms @returns {boolean} */
  rateLimit(action, ms) {
    const k = `_rl_${action}`;
    const last = Number(sessionStorage.getItem(k) || 0);
    if (Date.now() - last < ms) { return false; }
    sessionStorage.setItem(k, String(Date.now()));
    return true;
  }
};

/** @namespace PerfUtils */
const PerfUtils = {
  /** @param {Function} fn @param {number} d @returns {Function} */
  debounce(fn, d) {
    let t = null;
    return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), d); };
  },
  /** @param {Function} fn @param {number} l @returns {Function} */
  throttle(fn, l) {
    let w = false;
    return function (...a) { if (!w) { fn.apply(this, a); w = true; setTimeout(() => { w = false; }, l); } };
  }
};

/** @namespace DOMUtils */
const DOMUtils = {
  /** @param {string} s @param {Element} [p] @returns {Element|null} */
  qs(s, p = document) { try { return p.querySelector(s); } catch { return null; } },
  /** @param {string} s @param {Element} [p] @returns {Element[]} */
  qsa(s, p = document) { try { return [...p.querySelectorAll(s)]; } catch { return []; } },
  /** @param {string} msg @param {'polite'|'assertive'} [pr] */
  announce(msg, pr = 'polite') {
    const r = document.getElementById('aria-live-region');
    if (!r) { return; }
    r.setAttribute('aria-live', pr);
    r.textContent = '';
    requestAnimationFrame(() => { r.textContent = SecurityUtils.sanitize(msg); });
  }
};

/* ===================== TOAST ===================== */

/**
 * Show a toast notification
 * @param {string} message
 * @param {'info'|'success'|'error'} [type='info']
 */
function showToast(message, type = 'info') {
  try {
    const container = document.getElementById('toast-container');
    if (!container) { return; }
    const toast = document.createElement('div');
    toast.className = `toast ${SecurityUtils.sanitize(type)}`;
    toast.setAttribute('role', 'alert');
    toast.textContent = SecurityUtils.sanitize(message);
    container.appendChild(toast);
    DOMUtils.announce(message);
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease forwards';
      setTimeout(() => { if (toast.parentNode) { toast.parentNode.removeChild(toast); } }, 300);
    }, APP_CONFIG.TOAST_DURATION);
  } catch (err) {
    console.error('[Toast] Failed:', err);
  }
}

/* ===================== NAVIGATION ===================== */

/**
 * Navigation controller with keyboard and ARIA support
 * @class NavigationController
 */
class NavigationController {
  constructor() {
    /** @type {NodeListOf<Element>} */
    this._navItems = document.querySelectorAll('.nav-item');
    /** @type {NodeListOf<Element>} */
    this._views = document.querySelectorAll('.view');
    this._currentView = 'live-match';
    this._init();
  }

  _init() {
    this._navItems.forEach(item => {
      item.addEventListener('click', () => this.navigateTo(item.dataset.target));
      item.addEventListener('keydown', (e) => this._handleKeyNav(e));
    });
  }

  /**
   * Navigate to a specific view
   * @param {string} targetId - The view ID to navigate to
   */
  navigateTo(targetId) {
    if (!targetId || typeof targetId !== 'string') { return; }
    try {
      this._navItems.forEach(n => { n.classList.remove('active'); n.setAttribute('aria-selected', 'false'); });
      this._views.forEach(v => v.classList.remove('active'));
      const tab = DOMUtils.qs(`[data-target="${targetId}"]`);
      const view = document.getElementById(targetId);
      if (tab && view) {
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        view.classList.add('active');
        this._currentView = targetId;
        document.getElementById('content').scrollTop = 0;
        DOMUtils.announce(`Navigated to ${tab.textContent.trim()}`);
        if (typeof analyticsTracker !== 'undefined') { analyticsTracker.logEvent('view_change', { view: targetId }); }
      }
    } catch (err) {
      console.error('[Nav] navigateTo failed:', err);
    }
  }

  /** @param {KeyboardEvent} e */
  _handleKeyNav(e) {
    const items = [...this._navItems];
    const idx = items.indexOf(e.currentTarget);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { next = (idx + 1) % items.length; }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { next = (idx - 1 + items.length) % items.length; }
    if (next >= 0) { e.preventDefault(); items[next].focus(); items[next].click(); }
  }

  /** @returns {string} */
  getCurrentView() { return this._currentView; }
}

/* ===================== LIVE MATCH ENGINE ===================== */

/**
 * Simulates live cricket match updates
 * @class LiveMatchEngine
 */
class LiveMatchEngine {
  constructor() {
    this._runs = 184;
    this._wickets = 4;
    this._balls = 110;
    this._recentBalls = ['1','W','4','0','6','2','1','4','1','2'];
    this._intervalId = null;
    this._render();
  }

  start() {
    if (this._intervalId) { return; }
    this._intervalId = setInterval(() => this._tick(), APP_CONFIG.UPDATE_INTERVAL);
  }

  stop() { clearInterval(this._intervalId); this._intervalId = null; }

  _tick() {
    try {
      const outcome = MATCH_CONFIG.OUTCOMES[Math.floor(Math.random() * MATCH_CONFIG.OUTCOMES.length)];
      this._balls++;
      if (outcome === 'W') { this._wickets = Math.min(this._wickets + 1, 10); }
      else { this._runs += parseInt(outcome, 10); }
      this._recentBalls.push(outcome);
      if (this._recentBalls.length > 12) { this._recentBalls.shift(); }
      this._render();
      if (outcome === '6' || outcome === '4') {
        showToast(`${outcome === '6' ? 'SIX!' : 'FOUR!'} — ${MATCH_CONFIG.HOME.short} ${this._runs}/${this._wickets}`, 'success');
      }
    } catch (err) { console.error('[LiveMatch] tick error:', err); }
  }

  _render() {
    try {
      const overs = Math.floor(this._balls / 6);
      const ballsInOver = this._balls % 6;
      const scoreEl = document.getElementById('team1-score');
      const oversEl = document.getElementById('team1-overs');
      const eqEl = document.getElementById('match-equation');
      if (scoreEl) { scoreEl.textContent = `${this._runs}/${this._wickets}`; }
      if (oversEl) { oversEl.textContent = `(${overs}.${ballsInOver})`; }
      const need = MATCH_CONFIG.TARGET - this._runs;
      if (eqEl) { eqEl.textContent = need > 0 ? `RCB need ${need} runs from ${120 - this._balls} balls` : 'RCB have reached the target!'; }
      this._renderBalls();
    } catch (err) { console.error('[LiveMatch] render error:', err); }
  }

  _renderBalls() {
    const container = document.getElementById('recent-balls');
    if (!container) { return; }
    container.innerHTML = '';
    this._recentBalls.slice(-8).forEach(run => {
      const el = document.createElement('div');
      el.className = 'ball';
      el.setAttribute('role', 'listitem');
      el.setAttribute('aria-label', run === 'W' ? 'Wicket' : `${run} run${run !== '1' ? 's' : ''}`);
      if (run === '4') { el.classList.add('boundary'); }
      else if (run === '6') { el.classList.add('six'); }
      else if (run === 'W') { el.classList.add('wicket'); }
      el.textContent = run;
      container.appendChild(el);
    });
  }

  /** @returns {{ runs: number, wickets: number, balls: number }} */
  getState() { return { runs: this._runs, wickets: this._wickets, balls: this._balls }; }
}

/* ===================== CROWD MANAGEMENT ===================== */

/**
 * Real-time crowd density monitoring system
 * @class CrowdManager
 */
class CrowdManager {
  constructor() {
    this._densities = {};
    Object.keys(ZONES).forEach(z => { this._densities[z] = Math.floor(Math.random() * 60) + 30; });
    this._intervalId = null;
    this._render();
  }

  start() {
    if (this._intervalId) { return; }
    this._intervalId = setInterval(() => this._update(), APP_CONFIG.CROWD_INTERVAL);
  }

  stop() { clearInterval(this._intervalId); this._intervalId = null; }

  _update() {
    try {
      Object.keys(this._densities).forEach(z => {
        const delta = Math.floor(Math.random() * 11) - 5;
        this._densities[z] = Math.max(10, Math.min(98, this._densities[z] + delta));
      });
      this._render();
      const crowded = Object.entries(this._densities).filter(([, v]) => v > 85);
      if (crowded.length > 0) {
        showToast(`⚠️ ${crowded[0][0]} is crowded (${crowded[0][1]}%). Use alternate routes.`, 'error');
      }
    } catch (err) { console.error('[Crowd] update error:', err); }
  }

  _render() {
    const container = document.getElementById('crowd-bars');
    if (!container) { return; }
    container.innerHTML = '';
    Object.entries(this._densities).forEach(([zone, pct]) => {
      const level = pct > 80 ? 'high' : pct > 50 ? 'medium' : 'low';
      const row = document.createElement('div');
      row.className = 'crowd-bar-row';
      row.innerHTML = `<span class="crowd-bar-label">${SecurityUtils.sanitize(zone)}</span>
        <div class="crowd-bar-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${zone} crowd density ${pct}%"><div class="crowd-bar-fill ${level}" style="width:${pct}%"></div></div>
        <span class="crowd-bar-pct">${pct}%</span>`;
      container.appendChild(row);
    });
  }

  /** @returns {Object} */
  getDensities() { return { ...this._densities }; }
}

/* ===================== QUEUE ESTIMATOR ===================== */

/**
 * Wait time estimation for stadium facilities
 * @class QueueEstimator
 */
class QueueEstimator {
  constructor() { this._waits = {}; this._intervalId = null; this._update(); }

  start() { if (this._intervalId) { return; } this._intervalId = setInterval(() => this._update(), 8000); }
  stop() { clearInterval(this._intervalId); this._intervalId = null; }

  _update() {
    try {
      FACILITIES.forEach(f => {
        this._waits[f.name] = Math.max(1, f.base + Math.floor(Math.random() * 9) - 4);
      });
      this._render();
    } catch (err) { console.error('[Queue] update error:', err); }
  }

  _render() {
    const grid = document.getElementById('queue-grid');
    if (!grid) { return; }
    grid.innerHTML = '';
    FACILITIES.forEach(f => {
      const wait = this._waits[f.name] || f.base;
      const cls = wait > 10 ? 'busy' : 'ok';
      const item = document.createElement('div');
      item.className = 'queue-item';
      item.innerHTML = `<i class="fa-solid fa-${SecurityUtils.sanitize(f.icon)}" aria-hidden="true"></i>
        <div class="q-label">${SecurityUtils.sanitize(f.name)}</div>
        <div class="q-time ${cls}" aria-label="${wait} minutes wait">${wait} min</div>`;
      grid.appendChild(item);
    });
  }
}

/* ===================== FACILITY RENDERER ===================== */

/** Renders nearby facilities on the map view */
function renderFacilities() {
  const list = document.getElementById('facility-list');
  if (!list) { return; }
  list.innerHTML = '';
  FACILITIES.forEach(f => {
    const wait = Math.max(1, f.base + Math.floor(Math.random() * 5));
    const li = document.createElement('li');
    li.className = 'facility-item';
    li.innerHTML = `<i class="fa-solid fa-${SecurityUtils.sanitize(f.icon)}" aria-hidden="true"></i>
      <span class="f-name">${SecurityUtils.sanitize(f.name)}</span>
      <span class="f-wait ${wait > 8 ? 'busy' : ''}" aria-label="${wait} minute wait">${wait} min wait</span>`;
    list.appendChild(li);
  });
}

/* ===================== EMERGENCY HANDLER ===================== */

/**
 * SOS and emergency alert handler with rate limiting
 * @class EmergencyHandler
 */
class EmergencyHandler {
  constructor() {
    this._btn = document.getElementById('sos-btn');
    if (this._btn) { this._btn.addEventListener('click', () => this._handleSOS()); }
  }

  _handleSOS() {
    if (!SecurityUtils.rateLimit('sos', APP_CONFIG.SOS_COOLDOWN)) {
      showToast('SOS already sent. Please wait before sending again.', 'error');
      DOMUtils.announce('SOS already sent recently. Please wait.', 'assertive');
      return;
    }
    try {
      const btn = this._btn;
      const original = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Alerting Security...';
      btn.disabled = true;
      btn.style.background = '#991b1b';
      DOMUtils.announce('SOS alert sent. Security has been notified.', 'assertive');
      if (typeof analyticsTracker !== 'undefined') { analyticsTracker.logEvent('sos_triggered'); }
      if (typeof firebaseService !== 'undefined') {
        firebaseService.logEmergency({ type: 'SOS', seat: 'G-M45', timestamp: Date.now() });
      }
      setTimeout(() => {
        btn.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Security Dispatched';
        btn.style.background = '#10b981';
        btn.classList.remove('pulse-danger');
        showToast('Security team has been dispatched to your location.', 'success');
        setTimeout(() => { btn.innerHTML = original; btn.style.background = ''; btn.classList.add('pulse-danger'); btn.disabled = false; }, 5000);
      }, 2000);
    } catch (err) {
      console.error('[SOS] Error:', err);
      showToast('Failed to send SOS. Please call 112 directly.', 'error');
    }
  }
}

/* ===================== MAP ZOOM ===================== */

/** Map zoom controller */
class MapZoomController {
  constructor() {
    this._scale = 1;
    this._img = document.getElementById('stadium-img');
    const zoomIn = document.getElementById('btn-zoom-in');
    const zoomOut = document.getElementById('btn-zoom-out');
    const reset = document.getElementById('btn-reset-zoom');
    if (zoomIn) { zoomIn.addEventListener('click', () => this._zoom(0.2)); }
    if (zoomOut) { zoomOut.addEventListener('click', () => this._zoom(-0.2)); }
    if (reset) { reset.addEventListener('click', () => this._reset()); }
  }

  _zoom(delta) {
    this._scale = Math.max(0.5, Math.min(3, this._scale + delta));
    if (this._img) { this._img.style.transform = `scale(${this._scale})`; }
  }

  _reset() { this._scale = 1; if (this._img) { this._img.style.transform = 'scale(1)'; } }
}

/* ===================== ANALYTICS TRACKER ===================== */

/**
 * Tracks user interactions via Firebase Analytics
 * @class AnalyticsTracker
 */
class AnalyticsTracker {
  constructor() { this._analytics = null; }

  /**
   * Initialize with Firebase Analytics instance
   * @param {Object|null} analyticsInstance
   */
  init(analyticsInstance) { this._analytics = analyticsInstance; }

  /**
   * Log an analytics event
   * @param {string} name
   * @param {Object} [params={}]
   */
  logEvent(name, params = {}) {
    try {
      if (this._analytics && typeof firebase !== 'undefined' && firebase.analytics) {
        firebase.analytics().logEvent(name, params);
      }
      console.debug(`[Analytics] ${name}`, params);
    } catch (err) { console.warn('[Analytics] logEvent failed:', err); }
  }
}

/* ===================== SERVICE WORKER ===================== */

/** Register the service worker for offline caching */
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.info('[SW] Registered:', reg.scope);
    } catch (err) {
      console.warn('[SW] Registration failed:', err);
    }
  }
}

/* ===================== MAIN APP ===================== */

/** @type {AnalyticsTracker} */
const analyticsTracker = new AnalyticsTracker();

/**
 * Main application orchestrator
 * @class SmartStadiumApp
 */
class SmartStadiumApp {
  constructor() {
    /** @type {NavigationController|null} */ this._nav = null;
    /** @type {LiveMatchEngine|null} */ this._match = null;
    /** @type {CrowdManager|null} */ this._crowd = null;
    /** @type {QueueEstimator|null} */ this._queue = null;
    /** @type {EmergencyHandler|null} */ this._emergency = null;
    /** @type {MapZoomController|null} */ this._mapZoom = null;
    this._resizeHandler = PerfUtils.debounce(() => this._onResize(), 250);
  }

  /** Initialize the application */
  async init() {
    try {
      console.info(`[App] Smart Stadium v${APP_CONFIG.VERSION || '2.0.0'} initializing...`);
      this._nav = new NavigationController();
      this._match = new LiveMatchEngine();
      this._match.start();
      this._crowd = new CrowdManager();
      this._crowd.start();
      this._queue = new QueueEstimator();
      this._queue.start();
      this._emergency = new EmergencyHandler();
      this._mapZoom = new MapZoomController();
      renderFacilities();
      this._bindGlobalEvents();
      await registerServiceWorker();
      this._initFirebase();
      this._loadUserProfile();
      showToast('Welcome to Smart Stadium! Match is LIVE.', 'success');
      DOMUtils.announce('Smart Stadium loaded. Live match in progress.');
      console.info('[App] Initialized successfully.');
    } catch (err) {
      console.error('[App] Initialization failed:', err);
      showToast('App failed to load. Please refresh.', 'error');
    }
  }

  _bindGlobalEvents() {
    window.addEventListener('resize', this._resizeHandler);
    window.addEventListener('online', () => { showToast('Connection restored.', 'success'); DOMUtils.announce('You are back online.'); });
    window.addEventListener('offline', () => { showToast('You are offline. Some features may not work.', 'error'); DOMUtils.announce('You are offline.', 'assertive'); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this._match?.stop(); this._crowd?.stop(); this._queue?.stop(); }
      else { this._match?.start(); this._crowd?.start(); this._queue?.start(); }
    });
  }

  _initFirebase() {
    try {
      if (typeof firebaseService !== 'undefined' && firebaseService.isReady()) {
        analyticsTracker.init(firebaseService.getAnalytics());
        analyticsTracker.logEvent('app_loaded');
        firebaseService.authAnonymously();
        console.info('[App] Firebase connected.');
      }
    } catch (err) { console.warn('[App] Firebase init skipped:', err.message); }
  }

  _loadUserProfile() {
    try {
      const stored = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PROFILE);
      if (stored) {
        const profile = JSON.parse(stored);
        const nameEl = document.getElementById('profile-name');
        if (nameEl && profile.name) { nameEl.textContent = SecurityUtils.sanitize(profile.name); }
      }
    } catch (err) { console.warn('[App] Profile load failed:', err); }
  }

  _onResize() { /* Responsive adjustments if needed */ }

  /** Clean up all intervals and listeners */
  destroy() {
    this._match?.stop();
    this._crowd?.stop();
    this._queue?.stop();
    window.removeEventListener('resize', this._resizeHandler);
    console.info('[App] Destroyed.');
  }
}

/* ===================== BOOTSTRAP ===================== */

document.addEventListener('DOMContentLoaded', () => {
  const app = new SmartStadiumApp();
  app.init();
  window.__smartStadium = app;
});

/* ===================== EXPORTS FOR TESTING ===================== */

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SecurityUtils, PerfUtils, DOMUtils, showToast,
    NavigationController, LiveMatchEngine, CrowdManager,
    QueueEstimator, EmergencyHandler, AnalyticsTracker,
    SmartStadiumApp, APP_CONFIG, MATCH_CONFIG, ZONES, FACILITIES
  };
}
