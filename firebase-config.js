/**
 * @fileoverview Firebase configuration and service wrapper
 * @description Initializes Firebase Auth, Firestore, Analytics and Cloud Messaging
 * for the Smart Stadium Experience application.
 * @version 2.0.0
 */
'use strict';

/** @constant {Object} FIREBASE_CONFIG */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDummyKeyForSmartStadium',
  authDomain: 'perceptive-bay-493811-c1.firebaseapp.com',
  projectId: 'perceptive-bay-493811-c1',
  storageBucket: 'perceptive-bay-493811-c1.appspot.com',
  messagingSenderId: '879775404804',
  appId: '1:879775404804:web:smartstadium',
  measurementId: 'G-SMARTSTADIUM'
};

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
      console.info('[Firebase] Initialized successfully for project:', FIREBASE_CONFIG.projectId);
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
      console.info('[Firebase] Anonymous auth success:', cred.user.uid);
      return cred.user;
    } catch (err) {
      console.warn('[Firebase] Anonymous auth failed:', err.message);
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
      console.info('[Firestore] Profile saved for:', uid);
    } catch (err) { console.error('[Firestore] saveProfile failed:', err); }
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
      console.info('[Firestore] Emergency logged.');
    } catch (err) { console.error('[Firestore] logEmergency failed:', err); }
  }

  /**
   * Save crowd density snapshot
   * @param {Object} densities
   */
  async saveCrowdSnapshot(densities) {
    if (!this._db) { return; }
    try {
      await this._db.collection('crowd_snapshots').add({
        densities,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (err) { console.warn('[Firestore] saveCrowdSnapshot failed:', err); }
  }

  /**
   * Get match history for user
   * @param {string} uid
   * @returns {Promise<Array>}
   */
  async getMatchHistory(uid) {
    if (!this._db || !uid) { return []; }
    try {
      const snap = await this._db.collection('users').doc(uid)
        .collection('match_history').orderBy('date', 'desc').limit(10).get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.warn('[Firestore] getMatchHistory failed:', err);
      return [];
    }
  }
}

/** @type {FirebaseService} */
const firebaseService = new FirebaseService();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FirebaseService, FIREBASE_CONFIG, firebaseService };
}
