/**
 * Base URL for API calls. Default '' = same origin (e.g. Express+Vite on :3000).
 * If you run the Vite dev server on another port and multipart proxy breaks uploads, set in `.env`:
 *   VITE_API_ORIGIN=http://localhost:3000
 */
export const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN as string | undefined) ?? '';
