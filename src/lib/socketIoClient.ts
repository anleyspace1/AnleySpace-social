import io from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { getApiBase } from './apiOrigin';

const defaultOptions = {
  transports: ['websocket', 'polling'] as const,
  autoConnect: true,
};

/**
 * Socket.IO connection to the same Express host that serves `/api/*`.
 * Uses `getApiBase()` → `VITE_API_ORIGIN` when set, else `window.location.origin` (dev proxy).
 * On Vercel static hosting, set `VITE_API_ORIGIN` to your API server so Socket.IO does not connect to Vercel.
 */
export function createSocketIoClient(): Socket {
  const url = getApiBase() || undefined;
  return io(url, defaultOptions);
}
