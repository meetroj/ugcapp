/**
 * Whether the soft keyboard is currently on screen.
 *
 * Screens with a pinned footer pad it by the bottom safe-area inset so the
 * button clears the gesture bar. Once the keyboard opens it covers that area
 * itself, and the inset becomes a visible dark strip between the button and the
 * top of the keyboard — so the padding has to drop while it is up.
 *
 * Android only emits keyboardDidShow/Hide; iOS emits the Will* pair too, and
 * using those there makes the footer move with the keyboard rather than after
 * it.
 */
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const shown = Keyboard.addListener(showEvent, () => setVisible(true));
    const hidden = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return visible;
}
