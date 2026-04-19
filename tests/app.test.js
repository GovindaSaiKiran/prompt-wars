/**
 * @fileoverview Comprehensive test suite for Smart Stadium Experience v2.2
 * @description Tests for code quality, security, accessibility, edge cases, and integrations.
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

/* ============ SETUP ============ */

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

global.firebase = {
  apps: [],
  initializeApp: jest.fn(() => ({})),
  app: jest.fn(() => ({})),
  auth: jest.fn(() => ({ signInAnonymously: jest.fn().mockResolvedValue({ user: { uid: 'test-uid' } }) })),
  firestore: Object.assign(jest.fn(() => ({
    settings: jest.fn(),
    enablePersistence: jest.fn().mockResolvedValue(undefined),
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({ set: jest.fn().mockResolvedValue(undefined), collection: jest.fn(() => ({ orderBy: jest.fn(() => ({ limit: jest.fn(() => ({ get: jest.fn().mockResolvedValue({ docs: [] }) })) })) })) })),
      add: jest.fn().mockResolvedValue({ id: 'test-id' })
    }))
  })), { CACHE_SIZE_UNLIMITED: -1, FieldValue: { serverTimestamp: jest.fn() } }),
  analytics: jest.fn(() => ({ logEvent: jest.fn() }))
};

global.sessionStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};

global.localStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};

// Load modules
beforeAll(() => {
  document.documentElement.innerHTML = html;
  const fbCode = fs.readFileSync(path.resolve(__dirname, '../firebase-config.js'), 'utf8');
  eval(fbCode);
  const appCode = fs.readFileSync(path.resolve(__dirname, '../app.js'), 'utf8');
  eval(appCode);
});

/* ============ UNIT TESTS ============ */

describe('SecurityUtils', () => {
  const { SecurityUtils } = require('../app.js');

  test('sanitize prevents XSS', () => {
    const malicious = '<script>alert("xss")</script>';
    expect(SecurityUtils.sanitize(malicious)).toContain('&lt;script&gt;');
  });

  test('validateNum enforces bounds', () => {
    expect(SecurityUtils.validateNum(5, 0, 10)).toBe(5);
    expect(SecurityUtils.validateNum(15, 0, 10)).toBeNull();
    expect(SecurityUtils.validateNum('abc')).toBeNull();
  });
});

describe('AppError', () => {
  const { AppError } = require('../app.js');

  test('AppError stores context', () => {
    const err = new AppError('Test Error', { code: 500 });
    expect(err.message).toBe('Test Error');
    expect(err.context.code).toBe(500);
  });
});

describe('LiveMatchEngine', () => {
  const { LiveMatchEngine } = require('../app.js');

  test('initializes with default score', () => {
    const engine = new LiveMatchEngine();
    expect(engine.state.runs).toBe(184);
    expect(engine.state.wickets).toBe(4);
  });

  test('tick updates match state', () => {
    const engine = new LiveMatchEngine();
    const prevBalls = engine.state.balls;
    engine.tick();
    expect(engine.state.balls).toBe(prevBalls + 1);
  });
});

/* ============ ACCESSIBILITY TESTS ============ */

describe('Accessibility', () => {
  test('has skip link', () => {
    expect(document.getElementById('skip-nav')).not.toBeNull();
  });

  test('has ARIA live region', () => {
    expect(document.getElementById('aria-live-region')).not.toBeNull();
  });

  test('icons are aria-hidden', () => {
    const icons = document.querySelectorAll('i.fa-solid');
    icons.forEach(i => expect(i.getAttribute('aria-hidden')).toBe('true'));
  });
});

/* ============ GOOGLE SERVICES TESTS ============ */

describe('GoogleServices', () => {
  test('CloudLogger logs to simulation', async () => {
    const { firebaseService } = require('../firebase-config.js');
    await firebaseService.logger.log('INFO', 'Test Log');
    expect(global.firebase.analytics).toHaveBeenCalled();
  });

  test('Google Maps iframe is present', () => {
    const iframe = document.querySelector('iframe[title="Google Maps Stadium Location"]');
    expect(iframe).not.toBeNull();
    expect(iframe.src).toContain('google.com/maps/embed');
  });
});
