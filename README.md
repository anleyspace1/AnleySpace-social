<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/62d0d860-7e3a-49cb-9d90-de8bb4b2a2b7

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to Vercel (frontend)

This repo is a **Vite + React** app. Vercel settings:

| Setting | Value |
|--------|--------|
| Framework Preset | Vite |
| Root Directory | `.` (repository root, where `package.json` is) |
| Build Command | `npm run build` |
| Output Directory | `dist` |

**Environment variables** (Project → Settings → Environment Variables). Prefix with `VITE_` so they are available in the client bundle at build time:

- `VITE_SUPABASE_URL` — Supabase project URL  
- `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key  
- `GEMINI_API_KEY` — if your build uses Gemini (see `vite.config.ts`)  
- `VITE_API_ORIGIN` — optional; set to your **deployed API base URL** if `/api` is not on the same domain as the static site  

`vercel.json` configures **SPA routing**: client routes fall back to `index.html`.

**Note:** `npm run dev` / `npm start` run the **Express** server (`server.ts`) for API, WebSockets, and SQLite. That server is **not** part of the static Vercel output. For production, either host the API elsewhere and set `VITE_API_ORIGIN`, or add a separate Node deployment for `server.ts`.
