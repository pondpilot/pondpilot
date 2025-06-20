// A global context providing which modifier keys are currently pressed.
import { useOs } from '@mantine/hooks';
import { KeyboardModifiers } from '@models/keyboard';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const NO_MODIFIERS: KeyboardModifiers = {
  alt: false,
  ctrl: false,
  meta: false,
  mod: false,
  shift: false,
};

const ModifierContext = createContext<KeyboardModifiers>(NO_MODIFIERS);

export const useModifierContext = () => useContext(ModifierContext);

export const ModifierProvider = ({ children }: { children: React.ReactNode }) => {
  const [isAltPressed, setIsAltPressed] = useState(false);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  const [isMetaPressed, setIsMetaPressed] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const os = useOs();

  const isMacOS = os === 'macos';
  const isModPressed = isMacOS ? isMetaPressed : isCtrlPressed;

  const activeModifiers: KeyboardModifiers = useMemo(
    () => ({
      alt: isAltPressed,
      ctrl: isCtrlPressed,
      meta: isMetaPressed,
      mod: isModPressed,
      shift: isShiftPressed,
    }),
    [isAltPressed, isCtrlPressed, isMetaPressed, isModPressed, isShiftPressed],
  );

  // Subscribe on mount
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Checking for state of the button prevents multiple state updates
      // when the secondary button is pressed
      if (event.key === 'Alt' && !isAltPressed) {
        setIsAltPressed(true);
      }
      if (event.key === 'Control' && !isCtrlPressed) {
        setIsCtrlPressed(true);
      }
      if (event.key === 'Meta' && !isMetaPressed) {
        setIsMetaPressed(true);
      }
      if (event.key === 'Shift' && !isShiftPressed) {
        setIsShiftPressed(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        setIsAltPressed(false);
      }
      if (event.key === 'Control') {
        setIsCtrlPressed(false);
      }
      if (event.key === 'Meta') {
        setIsMetaPressed(false);
      }
      if (event.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };

    // Handle window losing focus which might miss the keyup
    const handleBlur = () => {
      setIsAltPressed(false);
      setIsCtrlPressed(false);
      setIsMetaPressed(false);
      setIsShiftPressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  return <ModifierContext.Provider value={activeModifiers}>{children}</ModifierContext.Provider>;
};
