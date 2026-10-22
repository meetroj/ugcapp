/**
 * Counts every screen's top bar needs but no screen owns: the unread notifications
 * for the bell. WebShell fills it in once (from the same live updates as the message
 * badge), and AppHeader reads it, so the bell shows its number on every tab without
 * each screen passing it down.
 */
import { createContext } from 'react';

export const HeaderCountsContext = createContext<{ notifications: number }>({ notifications: 0 });
