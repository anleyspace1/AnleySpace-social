import io from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { API_ORIGIN } from './apiOrigin';

const defaultOptions = {
  transports: ['websocket', 'polling'] as const,
  autoConnect: true,
};

/**
 * Socket.IO connection to the same Express host that serves `/api/*`.
 * - Dev (Vite): `VITE_API_ORIGIN` unset → same browser origin; Vite proxies `/socket.io` → :3000.
 * - Production (Vercel static): **must** set `VITE_API_ORIGIN=https://your-api.example.com` so the
 *   client connects to your deployed Node server (calls, signaling). Connecting to the Vercel URL
 *   has no Socket.IO server and calls will fail.
 */
export function createSocketIoClient(): Socket {
  const url = (API_ORIGIN && API_ORIGIN.trim()) || undefined;
  return io(url, defaultOptions);
}
