/**
 * @fileoverview Smart Stadium Experience — Main Application
 * @version 2.2.0
 * @description Real-time crowd management, live match tracking, digital ticketing,
 * transit coordination and emergency assistance for stadium attendees.
 * Integrates with Google Cloud Platform services.
 */
'use strict';

/* ===================== CORE TYPES ===================== */

/**
 * @typedef {Object} AppState
 * @property {string} currentView
 * @property {number} lastSosTimestamp
 * @property {boolean} isOnline
 */

/**
 * Custom error class for App-specific failures
 * @class AppError
 * @extends Error
 */
class AppError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'AppError';
    this.context = context;
    this.timestamp = new Date();
    if (typeof firebaseService !== 'undefined') {
        firebaseService.logger.log('ERROR', message, { ...context, name: this.name });
    }
  }
}

/* ===================== CONFIGURATION ===================== */

/** @constant {Object} APP_CONFIG */
const APP_CONFIG = {
  VERSION: '2.2.0',
  UPDATE_INTERVAL: 5000,
  CROWD_INTERVAL: 10000,
  TOAST_DURATION: 4000,
  SOS_COOLDOWN: 30000,
  STORAGE_KEYS: { PROFILE: 'ss_profile', HISTORY: 'ss_history', PREFS: 'ss_prefs' },
  GCP_PROJECT: 'perceptive-bay-493811-c1'
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
  /** 
   * Sanitizes text to prevent XSS
   * @param {string} t 
   * @returns {string} 
   */
  sanitize(t) {
    if (typeof t !== 'string') return '';
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
  },
  
  /** 
   * Validates numeric input within bounds
   * @param {*} v 
   * @param {number} min 
   * @param {number} max 
   * @returns {number|null} 
   */
  validateNum(v, min = 0, max = Infinity) {
    const n = Number(v);
    return (Number.isNaN(n) || !Number.isFinite(n) || n < min || n > max) ? null : n;
  },
  
  /** 
   * Enforces rate limiting on client actions
   * @param {string} action 
   * @param {number} ms 
   * @returns {boolean} 
   */
  rateLimit(action, ms) {
    const k = `_rl_${action}`;
    const last = Number(sessionStorage.getItem(k) || 0);
    if (Date.now() - last < ms) return false;
    sessionStorage.setItem(k, String(Date.now()));
    return true;
  }
};

/** @namespace PerfUtils */
const PerfUtils = {
  debounce(fn, d) {
    let t = null;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), d); };
  },
  throttle(fn, l) {
    let w = false;
    return (...a) => { if (!w) { fn(...a); w = true; setTimeout(() => w = false, l); } };
  }
};

/** @namespace DOMUtils */
const DOMUtils = {
  qs: (s, p = document) => p.querySelector(s),
  qsa: (s, p = document) => [...p.querySelectorAll(s)],
  
  /** 
   * Accessible ARIA-live announcement
   * @param {string} msg 
   * @param {'polite'|'assertive'} [pr='polite'] 
   */
  announce(msg, pr = 'polite') {
    const r = document.getElementById('aria-live-region');
    if (!r) return;
    r.setAttribute('aria-live', pr);
    r.textContent = '';
    requestAnimationFrame(() => r.textContent = SecurityUtils.sanitize(msg));
  }
};

/* ===================== APP MODULES ===================== */

/**
 * Handles UI notifications
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${SecurityUtils.sanitize(type)}`;
  toast.setAttribute('role', 'alert');
  toast.textContent = SecurityUtils.sanitize(message);
  container.appendChild(toast);
  DOMUtils.announce(message);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, APP_CONFIG.TOAST_DURATION);
}

/**
 * Navigation state and logic
 */
class NavigationController {
  constructor() {
    this._navItems = DOMUtils.qsa('.nav-item');
    this._views = DOMUtils.qsa('.view');
    this._init();
  }

  _init() {
    this._navItems.forEach(item => {
      item.addEventListener('click', () => this.navigateTo(item.dataset.target));
      item.addEventListener('keydown', e => this._handleKeyNav(e));
    });
  }

  navigateTo(targetId) {
    if (!targetId) return;
    const tab = DOMUtils.qs(`[data-target="${targetId}"]`);
    const view = document.getElementById(targetId);
    
    if (tab && view) {
      this._navItems.forEach(n => { n.classList.remove('active'); n.setAttribute('aria-selected', 'false'); });
      this._views.forEach(v => v.classList.remove('active'));
      
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      view.classList.add('active');
      
      document.getElementById('content').scrollTop = 0;
      DOMUtils.announce(`View changed to ${tab.textContent.trim()}`);
      analyticsTracker.logEvent('navigation', { target: targetId });
    }
  }

  _handleKeyNav(e) {
    const items = this._navItems;
    const idx = items.indexOf(e.currentTarget);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % items.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + items.length) % items.length;
    if (next >= 0) { e.preventDefault(); items[next].focus(); items[next].click(); }
  }
}

/**
 * Real-time match data simulation
 */
class LiveMatchEngine {
  constructor() {
    this.state = { runs: 184, wickets: 4, balls: 110, recent: ['1','W','4','0','6','2','1','4'] };
    this._interval = null;
    this.render();
  }

  start() { this._interval = setInterval(() => this.tick(), APP_CONFIG.UPDATE_INTERVAL); }
  stop() { clearInterval(this._interval); }

  tick() {
    const outcome = MATCH_CONFIG.OUTCOMES[Math.floor(Math.random() * MATCH_CONFIG.OUTCOMES.length)];
    this.state.balls++;
    if (outcome === 'W') this.state.wickets = Math.min(this.state.wickets + 1, 10);
    else this.state.runs += parseInt(outcome, 10);
    
    this.state.recent.push(outcome);
    if (this.state.recent.length > 8) this.state.recent.shift();
    
    this.render();
    if (outcome === '6' || outcome === '4') {
        showToast(`${outcome === '6' ? 'MAXIMUM!' : 'BOUNDARY!'} RCB: ${this.state.runs}/${this.state.wickets}`, 'success');
    }
  }

  render() {
    const overs = `${Math.floor(this.state.balls / 6)}.${this.state.balls % 6}`;
    DOMUtils.qs('#team1-score').textContent = `${this.state.runs}/${this.state.wickets}`;
    DOMUtils.qs('#team1-overs').textContent = `(${overs})`;
    
    const need = MATCH_CONFIG.TARGET - this.state.runs;
    DOMUtils.qs('#match-equation').textContent = need > 0 
        ? `RCB need ${need} runs in ${120 - this.state.balls} balls`
        : 'Match Won by RCB!';
        
    const container = DOMUtils.qs('#recent-balls');
    container.innerHTML = '';
    this.state.recent.forEach(r => {
      const el = document.createElement('div');
      el.className = `ball ${r === '4' ? 'boundary' : r === '6' ? 'six' : r === 'W' ? 'wicket' : ''}`;
      el.textContent = r;
      container.appendChild(el);
    });
  }
}

/**
 * Crowd and Queue Management
 */
class StadiumOperations {
  constructor() {
    this.densities = {};
    Object.keys(ZONES).forEach(z => this.densities[z] = 40 + Math.random() * 20);
    this._interval = setInterval(() => this.update(), APP_CONFIG.CROWD_INTERVAL);
    this.update();
  }

  update() {
    Object.keys(ZONES).forEach(z => {
      this.densities[z] = Math.max(10, Math.min(98, this.densities[z] + (Math.random() * 10 - 5)));
    });
    this.renderCrowd();
    this.renderQueues();
  }

  renderCrowd() {
    const container = DOMUtils.qs('#crowd-bars');
    if (!container) return;
    container.innerHTML = '';
    Object.entries(this.densities).forEach(([zone, pct]) => {
      const val = Math.round(pct);
      const level = val > 80 ? 'high' : val > 50 ? 'medium' : 'low';
      container.innerHTML += `
        <div class="crowd-bar-row">
          <span class="crowd-bar-label">${zone}</span>
          <div class="crowd-bar-track" role="progressbar" aria-valuenow="${val}" aria-valuemin="0" aria-valuemax="100">
            <div class="crowd-bar-fill ${level}" style="width:${val}%"></div>
          </div>
          <span class="crowd-bar-pct">${val}%</span>
        </div>`;
    });
  }

  renderQueues() {
    const grid = DOMUtils.qs('#queue-grid');
    if (!grid) return;
    grid.innerHTML = '';
    FACILITIES.forEach(f => {
      const wait = Math.round(f.base + Math.random() * 5);
      grid.innerHTML += `
        <div class="queue-item">
          <i class="fa-solid fa-${f.icon}" aria-hidden="true"></i>
          <div class="q-label">${f.name}</div>
          <div class="q-time ${wait > 10 ? 'busy' : 'ok'}">${wait} min</div>
        </div>`;
    });
  }
}

/**
 * Global Emergency Alert Handler
 */
class EmergencyController {
  constructor() {
    this.btn = DOMUtils.qs('#sos-btn');
    this.btn?.addEventListener('click', () => this.triggerSOS());
  }

  async triggerSOS() {
    if (!SecurityUtils.rateLimit('sos', APP_CONFIG.SOS_COOLDOWN)) {
      showToast('SOS Cooldown: Security already alerted.', 'error');
      return;
    }

    const originalText = this.btn.textContent;
    this.btn.disabled = true;
    this.btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Alerting...';
    
    try {
      if (typeof firebaseService !== 'undefined') {
        await firebaseService.logEmergency({ 
          type: 'SOS_TRIGGER', 
          location: 'Stand G, Row M, Seat 45',
          timestamp: Date.now() 
        });
      }
      
      DOMUtils.announce('SOS Alert Sent. Security Dispatched.', 'assertive');
      showToast('Security team alerted! They are moving to your seat.', 'success');
      
      setTimeout(() => {
        this.btn.innerHTML = '<i class="fa-solid fa-check"></i> Dispatched';
        this.btn.style.background = 'var(--accent-green)';
        setTimeout(() => {
          this.btn.textContent = originalText;
          this.btn.style.background = '';
          this.btn.disabled = false;
        }, 5000);
      }, 1500);
    } catch (e) {
      new AppError('SOS Trigger Failed', { error: e.message });
      showToast('Alert failed. Please call 112.', 'error');
    }
  }
}

/**
 * Analytics Interface
 */
const analyticsTracker = {
  logEvent(name, params = {}) {
    if (typeof firebase !== 'undefined' && firebase.analytics) {
      firebase.analytics().logEvent(name, params);
    }
    console.debug(`[Analytics] ${name}`, params);
  }
};

/* ===================== BOOTSTRAP ===================== */

class SmartStadiumApp {
  constructor() {
    this.nav = null;
    this.match = null;
    this.ops = null;
    this.sos = null;
  }

  async init() {
    try {
      console.info(`Smart Stadium App v${APP_CONFIG.VERSION} Initializing...`);
      
      this.nav = new NavigationController();
      this.match = new LiveMatchEngine();
      this.ops = new StadiumOperations();
      this.sos = new EmergencyController();
      
      this.match.start();
      this.bindEvents();
      
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js');
      }
      
      if (typeof firebaseService !== 'undefined' && firebaseService.isReady()) {
        await firebaseService.authAnonymously();
      }
      
      showToast('Smart Stadium is Live!', 'success');
      firebaseService.logger.log('INFO', 'App successfully initialized');
      
    } catch (e) {
      console.error('App init failed:', e);
    }
  }

  bindEvents() {
    window.addEventListener('online', () => showToast('Online', 'success'));
    window.addEventListener('offline', () => showToast('Offline Mode Active', 'error'));
    
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.match.stop();
      else this.match.start();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new SmartStadiumApp();
  app.init();
});

// Exports for testing
if (typeof module !== 'undefined') {
  module.exports = { 
    SecurityUtils, PerfUtils, DOMUtils, AppError, 
    NavigationController, LiveMatchEngine, StadiumOperations, EmergencyController 
  };
}
