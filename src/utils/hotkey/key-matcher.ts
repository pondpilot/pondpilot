/*
 * This file contains code from Outerbase Studio (https://github.com/outerbase/studio)
 * Copyright (C) [2025] Outerbase
 * Licensed under GNU AGPL v3.0
 */
interface KeyMatcherProps {
  ctrl?: boolean;
  key?: string;
  shift?: boolean;
  alt?: boolean;
}

type KeyMatcherEvent =
  | KeyboardEvent
  | React.KeyboardEvent
  | {
      ctrlKey: boolean;
      metaKey?: boolean;
      shiftKey: boolean;
      altKey: boolean;
      key?: string;
      code?: string;
      browserEvent?: KeyboardEvent;
    };

function extractKey(event: KeyMatcherEvent): string | undefined {
  if ('key' in event && event.key) return event.key;
  if ('browserEvent' in event && event.browserEvent?.key) return event.browserEvent.key;
  return undefined;
}

function extractCode(event: KeyMatcherEvent): string | undefined {
  if ('code' in event && event.code) return event.code;
  if ('browserEvent' in event && event.browserEvent?.code) return event.browserEvent.code;
  return undefined;
}

export default class KeyMatcher {
  protected key: KeyMatcherProps;
  constructor(props: KeyMatcherProps) {
    this.key = props;
  }
  static capture(e: KeyMatcherEvent) {
    const isCtrlKey = e.ctrlKey || e.metaKey;
    let key: string | undefined = extractKey(e);
    if (key === 'Shift') key = undefined;
    if (key === 'Control') key = undefined;
    if (key === 'Alt') key = undefined;
    return new KeyMatcher({
      ctrl: isCtrlKey,
      shift: e.shiftKey,
      alt: e.altKey,
      key,
    });
  }

  match(e: KeyMatcherEvent) {
    let isMatched = true;
    const isCtrlKey = e.ctrlKey || e.metaKey;
    const key = extractKey(e);
    const code = extractCode(e);

    if (this.key.ctrl && !isCtrlKey) {
      isMatched = false;
    }

    if (this.key.key) {
      // Dead keys are not supported, so we need to check if the key is a dead key
      // It is temp solution, but it works for now
      if (this.key.key === 'n' && this.key.alt && this.key.ctrl && code === 'KeyN') {
        // Only match if alt is actually pressed
        return isMatched;
      }
      if (key !== this.key.key) {
        isMatched = false;
      }
    }

    if (this.key.shift && !e.shiftKey) {
      isMatched = false;
    }

    if (this.key.alt && !e.altKey) {
      isMatched = false;
    }
    return isMatched;
  }

  toJson(): KeyMatcherProps {
    return { ...this.key };
  }

  toString() {
    const isMac = navigator.userAgent.toLowerCase().indexOf('mac') > -1;
    return [
      this.key.ctrl ? (isMac ? '⌘' : 'Ctrl') : undefined,
      this.key.alt ? (isMac ? '⌥' : 'Alt') : undefined,
      this.key.shift ? 'Shift' : undefined,
      this.key?.key?.toUpperCase(),
    ]
      .filter(Boolean)
      .join(' + ');
  }

  toCodeMirrorKey() {
    const isMac = navigator.userAgent.toLowerCase().indexOf('mac') > -1;
    return [
      this.key.ctrl ? (isMac ? 'Cmd' : 'Ctrl') : undefined,
      this.key.alt ? 'Alt' : undefined,
      this.key.shift ? 'Shift' : undefined,
      this.key?.key,
    ]
      .filter(Boolean)
      .join('-');
  }
}

export const KEY_BINDING = {
  run: new KeyMatcher({ ctrl: true, key: 'Enter' }),
  save: new KeyMatcher({ ctrl: true, key: 's' }),
  copy: new KeyMatcher({ ctrl: true, key: 'c' }),
  paste: new KeyMatcher({ ctrl: true, key: 'v' }),
  format: new KeyMatcher({ ctrl: true, shift: true, key: 'f' }),
  kmenu: new KeyMatcher({ ctrl: true, key: 'k' }),
  runSelection: new KeyMatcher({ ctrl: true, shift: true, key: 'Enter' }),
  openNewScript: new KeyMatcher({ ctrl: true, alt: true, key: 'n' }),
};
