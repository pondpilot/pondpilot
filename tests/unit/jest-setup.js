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

// Mock sessionStorage
global.sessionStorage = {
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

// Mock navigator
global.navigator = {
  userAgent: 'test-user-agent',
  language: 'en-US',
  hardwareConcurrency: 4,
};

// Mock window.screen
global.window.screen = {
  width: 1920,
  height: 1080,
  colorDepth: 24,
};
