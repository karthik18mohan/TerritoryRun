# TerritoryRun

A mobile-first Paper.io-style territory game using real-world GPS tracks. Close a loop to claim territory, steal overlapping slices, and watch the city shift in realtime.

> **Note:** Background tracking is not reliable in browsers. TerritoryRun is **foreground-only**. If the app goes into the background, tracking pauses and resumes when you return.

## Tech Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind
- **Maps:** MapLibre GL JS (Mapbox styles if token provided)
- **Backend:** Supabase (Postgres + PostGIS + Auth + Realtime)
- **Deployment:** Vercel

---

## 1) Supabase Setup (Hosted)

1. Create a project at [Supabase](https://supabase.com).
2. Enable **Google** as an Auth provider:
   - Go to **Authentication → Providers → Google**
   - Follow the instructions to add your OAuth client ID/secret
3. Copy the Supabase URL and anon key from **Project Settings → API**.
4. In **SQL Editor**, enable PostGIS if it isn't already (this is handled in the migration below).

### Run migrations

You can run SQL migrations with the Supabase CLI or the SQL Editor.

**Option A: Supabase CLI**

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

**Option B: SQL Editor**

- Open `/supabase/migrations/0001_init.sql` and run it in the SQL Editor.
- (Optional) Run `/supabase/seed.sql` to insert cities.

---

## 2) Local Development

### Prerequisites

- Node.js 18+
- Supabase CLI (optional for local stack)

### Environment variables

Create a `.env.local` file:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_MAPBOX_TOKEN=
NEXT_PUBLIC_MAP_STYLE_STREET=
NEXT_PUBLIC_MAP_STYLE_SATELLITE=
OSRM_BASE_URL=https://router.project-osrm.org
```

**Notes:**
- If no Mapbox token is provided, the map falls back to OSM street tiles. Satellite will be disabled unless you provide `NEXT_PUBLIC_MAP_STYLE_SATELLITE` (raster tile URL).
- `SUPABASE_SERVICE_ROLE_KEY` is required for `/api/claim`.

### Run locally

```bash
npm install
npm run dev
```

(Optional) run Supabase locally:

```bash
supabase start
supabase db reset
```

---

## 3) Deploy to Vercel

1. Push your repo to GitHub.
2. Create a new Vercel project and import the repo.
3. Set the environment variables from `.env.local` in the Vercel dashboard.
4. Deploy.

---

## City Data (MVP)

This repo ships with **placeholder boundaries** for Mysuru and Bengaluru (simple polygons). Replace these in the `cities` table with accurate city boundaries when ready.

---

## App Flow

1. **Login** with Google.
2. **Choose a username** (display name only).
3. **Select a city** (Mysuru or Bengaluru).
4. **Play:** track your GPS trail, close loops, and claim territory.

---

## Key Features

- 1-second update GPS tracking via `watchPosition` (high accuracy)
- Snap-to-road via OSRM with fallback to raw GPS
- Realtime territories and live players via Supabase Realtime
- Foreground-only tracking with Screen Wake Lock (if supported)
- City filtering and boundary validation (server-side)

---

## Supabase Database Overview

Tables:
- `cities`
- `profiles`
- `sessions`
- `session_points`
- `territories`
- `claim_events`
- `live_players`

RPC:
- `claim_territory(p_user_id, p_city_id, p_session_id, p_polygon)`

---

## Scripts

```bash
npm run dev
npm run build
npm run lint
```

---

## Disclaimer

TerritoryRun is an MVP. Background tracking is not reliable in browser environments. Use foreground-only tracking for best results.
