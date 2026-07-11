import type { HotkeyItem } from '@mantine/hooks';
import { getHotkeyHandler } from '@mantine/hooks';
import { useEffect } from 'react';

export type { HotkeyItem };

/**
 * Registers document-level hotkeys, re-binding whenever the hotkey definitions
 * change so handlers always close over current component state.
 *
 * @mantine/hooks v9 registers its listener once and routes dispatch through
 * React's useEffectEvent; in this app that leaves handlers reading
 * first-render state (e.g. the data table's mod+C copy saw the initial empty
 * selection forever). This implementation keeps the re-register-on-change
 * contract the app relies on. Matching and preventDefault behavior are
 * delegated to Mantine's own parser via getHotkeyHandler, so key syntax stays
 * identical to @mantine/hooks.
 */
export function useHotkeys(
  hotkeys: HotkeyItem[],
  tagsToIgnore: string[] = ['INPUT', 'TEXTAREA', 'SELECT'],
  triggerOnContentEditable = false,
): void {
  useEffect(() => {
    const handler = getHotkeyHandler(hotkeys);
    const keydownListener = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (tagsToIgnore.includes(target.tagName)) return;
        if (!triggerOnContentEditable && target.isContentEditable) return;
      }
      handler(event);
    };
    document.documentElement.addEventListener('keydown', keydownListener);
    return () => document.documentElement.removeEventListener('keydown', keydownListener);
  }, [hotkeys]);
}
