/**
 * Keyboard Modifiers Mapping
 *
 * | Name  | Windows Key | Mac Key     | Event Property  |
 * |-------|------------|-------------|-----------------|
 * | alt   | Alt        | Option      | event.altKey    |
 * | ctrl  | Control    | Control     | event.ctrlKey   |
 * | meta  | Windows    | Command (⌘) | event.metaKey   |
 * | mod   | Control    | Command (⌘) | platform-based  |
 * | shift | Shift      | Shift       | event.shiftKey  |
 *
 * Note: 'mod' is a convenience alias that maps to Control on Windows and Command on Mac
 */
export type KeyboardModifiers = {
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  mod: boolean;
  shift: boolean;
};
