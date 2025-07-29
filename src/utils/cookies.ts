/**
 * Cookie utility functions for secure data storage
 */

export interface CookieOptions {
  expires?: Date;
  maxAge?: number;
  path?: string;
  domain?: string;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  httpOnly?: boolean;
}

const DEFAULT_COOKIE_OPTIONS: CookieOptions = {
  path: '/',
  secure: typeof window !== 'undefined' ? window.location.protocol === 'https:' : false,
  sameSite: 'strict',
  maxAge: 30 * 24 * 60 * 60, // 30 days
};

/**
 * Set a cookie with the given name, value, and options
 */
export function setCookie(name: string, value: string, options: CookieOptions = {}): void {
  const opts = { ...DEFAULT_COOKIE_OPTIONS, ...options };

  let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;

  if (opts.expires) {
    cookieString += `; expires=${opts.expires.toUTCString()}`;
  }

  if (opts.maxAge) {
    cookieString += `; max-age=${opts.maxAge}`;
  }

  if (opts.path) {
    cookieString += `; path=${opts.path}`;
  }

  if (opts.domain) {
    cookieString += `; domain=${opts.domain}`;
  }

  if (opts.secure) {
    cookieString += '; secure';
  }

  if (opts.sameSite) {
    cookieString += `; samesite=${opts.sameSite}`;
  }

  if (opts.httpOnly) {
    cookieString += '; httponly';
  }

  document.cookie = cookieString;
}

/**
 * Get a cookie value by name
 */
export function getCookie(name: string): string | null {
  const nameEQ = `${encodeURIComponent(name)}=`;
  const ca = document.cookie.split(';');

  for (let i = 0; i < ca.length; i += 1) {
    let c = ca[i];
    while (c.charAt(0) === ' ') {
      c = c.substring(1, c.length);
    }
    if (c.indexOf(nameEQ) === 0) {
      return decodeURIComponent(c.substring(nameEQ.length, c.length));
    }
  }

  return null;
}

/**
 * Delete a cookie by name
 */
export function deleteCookie(name: string, options: CookieOptions = {}): void {
  setCookie(name, '', {
    ...options,
    expires: new Date(0),
  });
}

/**
 * Check if cookies are available
 */
export function areCookiesAvailable(): boolean {
  try {
    const testKey = '__cookie_test__';
    setCookie(testKey, 'test');
    const result = getCookie(testKey) === 'test';
    deleteCookie(testKey);
    return result;
  } catch {
    return false;
  }
}

/**
 * Set a JSON object as a cookie
 */
export function setJSONCookie(name: string, value: any, options: CookieOptions = {}): void {
  setCookie(name, JSON.stringify(value), options);
}

/**
 * Get a JSON object from a cookie
 */
export function getJSONCookie<T = any>(name: string): T | null {
  const value = getCookie(name);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
