// Mock import.meta.env
global.import = {
  meta: {
    env: {
      DEV: false,
      PROD: true,
      VITE_CORS_PROXY_URL: undefined,
    },
  },
};

// Provide Web Crypto + base64 helpers for Node environment
const { webcrypto } = require('crypto');

global.crypto = webcrypto;
global.btoa = (value) => Buffer.from(String(value), 'binary').toString('base64');
global.atob = (value) => Buffer.from(String(value), 'base64').toString('binary');

// Mock window object for browser APIs
global.window = {
  location: {
    protocol: 'http:',
    href: 'http://localhost',
    origin: 'http://localhost',
  },
};

// Mock localStorage
global.localStorage = {
  _store: {},
  getItem(key) {
    return this._store[key] || null;
  },
  setItem(key, value) {
    this._store[key] = String(value);
  },
  removeItem(key) {
    delete this._store[key];
  },
  clear() {
    this._store = {};
  },
};
