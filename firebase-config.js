/**
 * @fileoverview Firebase configuration and service wrapper
 * @description Initializes Firebase Auth, Firestore, Analytics and Cloud Messaging
 * for the Smart Stadium Experience application.
 * @version 2.1.0
 */
'use strict';

/** @constant {Object} FIREBASE_CONFIG */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDummyKeyForSmartStadium_v2',
  authDomain: 'perceptive-bay-493811-c1.firebaseapp.com',
  projectId: 'perceptive-bay-493811-c1',
  storageBucket: 'perceptive-bay-493811-c1.appspot.com',
  messagingSenderId: '879775404804',
  appId: '1:879775404804:web:smartstadium',
  measurementId: 'G-SMARTSTADIUM'
};

/**
 * Cloud Logging simulation for Google Cloud Platform integration
 * @class CloudLogger
 */
class CloudLogger {
  constructor(projectId) {
    this.projectId = projectId;
    this.logName = 'smart-stadium-app-logs';
  }

  /**
   * Log an event to Google Cloud Logging (Simulation/REST)
   * @param {'INFO'|'WARNING'|'ERROR'|'CRITICAL'} severity
   * @param {string} message
   * @param {Object} [metadata={}]
   */
  async log(severity, message, metadata = {}) {
    console.info(`[GCP Cloud Logging] [${severity}] ${message}`, metadata);
    if (typeof firebase !== 'undefined' && firebase.analytics) {
        firebase.analytics().logEvent('cloud_log', { severity, message, ...metadata });
    }
    // Simulation of a REST call to Cloud Logging API
    try {
        const payload = {
            entries: [{
                logName: `projects/${this.projectId}/logs/${this.logName}`,
                resource: { type: 'global' },
                severity: severity,
                jsonPayload: { message, ...metadata, timestamp: new Date().toISOString() }
            }]
        };
        // This would be a real fetch if we had a service account token
        // fetch(`https://logging.googleapis.com/v2/entries:write`, { method: 'POST', body: JSON.stringify(payload) });
    } catch (e) { /* silent fail */ }
  }
}

/**
 * Firebase service wrapper with error handling and graceful degradation
 * @class FirebaseService
 */
class FirebaseService {
  constructor() {
    /** @type {Object|null} */ this._app = null;
    /** @type {Object|null} */ this._auth = null;
    /** @type {Object|null} */ this._db = null;
    /** @type {Object|null} */ this._analytics = null;
    /** @type {boolean} */ this._ready = false;
    this.logger = new CloudLogger(FIREBASE_CONFIG.projectId);
    this._init();
  }

  /** Initialize Firebase with graceful fallback */
  _init() {
    try {
      if (typeof firebase === 'undefined') {
        console.warn('[Firebase] SDK not loaded. Running in offline mode.');
        return;
      }
      if (!firebase.apps.length) {
        this._app = firebase.initializeApp(FIREBASE_CONFIG);
      } else {
        this._app = firebase.app();
      }
      this._auth = firebase.auth();
      this._db = firebase.firestore();
      if (typeof firebase.analytics === 'function') {
        this._analytics = firebase.analytics();
      }
      this._db.settings({ cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED });
      this._db.enablePersistence({ synchronizeTabs: true }).catch(err => {
        if (err.code === 'failed-precondition') {
          console.warn('[Firestore] Persistence failed: multiple tabs open.');
        } else if (err.code === 'unimplemented') {
          console.warn('[Firestore] Persistence not supported in this browser.');
        }
      });
      this._ready = true;
      this.logger.log('INFO', 'Firebase initialized', { projectId: FIREBASE_CONFIG.projectId });
    } catch (err) {
      console.error('[Firebase] Initialization failed:', err);
      this._ready = false;
    }
  }

  /** @returns {boolean} */
  isReady() { return this._ready; }

  /** @returns {Object|null} */
  getAnalytics() { return this._analytics; }

  /** @returns {Object|null} */
  getAuth() { return this._auth; }

  /** @returns {Object|null} */
  getFirestore() { return this._db; }

  /** Sign in anonymously for tracking */
  async authAnonymously() {
    if (!this._auth) { return null; }
    try {
      const cred = await this._auth.signInAnonymously();
      this.logger.log('INFO', 'Anonymous auth successful', { uid: cred.user.uid });
      return cred.user;
    } catch (err) {
      this.logger.log('ERROR', 'Anonymous auth failed', { error: err.message });
      return null;
    }
  }

  /**
   * Save user profile to Firestore
   * @param {string} uid
   * @param {Object} data
   */
  async saveProfile(uid, data) {
    if (!this._db || !uid) { return; }
    try {
      await this._db.collection('users').doc(uid).set(data, { merge: true });
      this.logger.log('INFO', 'Profile saved', { uid });
    } catch (err) { this.logger.log('ERROR', 'saveProfile failed', { error: err.message }); }
  }

  /**
   * Log emergency event to Firestore
   * @param {Object} data
   */
  async logEmergency(data) {
    if (!this._db) { return; }
    try {
      await this._db.collection('emergencies').add({
        ...data,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      this.logger.log('CRITICAL', 'Emergency alert logged', data);
    } catch (err) { this.logger.log('ERROR', 'logEmergency failed', { error: err.message }); }
  }

  /**
   * Real-time listener for crowd data
   * @param {Function} callback
   */
  subscribeToCrowdData(callback) {
    if (!this._db) return null;
    return this._db.collection('stadium_state').doc('crowd_density')
      .onSnapshot(doc => {
        if (doc.exists) callback(doc.data());
      }, err => {
        this.logger.log('ERROR', 'Crowd snapshot listener failed', { error: err.message });
      });
  }
}

/** @type {FirebaseService} */
const firebaseService = new FirebaseService();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FirebaseService, FIREBASE_CONFIG, firebaseService };
}
