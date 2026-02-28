# CineSwipe

A Tinder-style swipe interface for discovering movies and TV shows. Swipe right to save to your watchlist, left to skip. Powered by the TMDB API.

## Prerequisites

- Node.js 18+
- A free [TMDB API key](https://www.themoviedb.org/settings/api)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the environment template and fill in your values:
   ```bash
   cp .env.example .env
   ```
   - `VITE_TMDB_API_KEY` — get a free key at [themoviedb.org](https://www.themoviedb.org/settings/api)
   - `JWT_SECRET` — generate with:
     ```bash
     node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
     ```

3. Start the dev server:
   ```bash
   npm run dev
   ```
   App runs at `http://localhost:3000`

## Production

```bash
npm run build
NODE_ENV=production npm start
```

## Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Framer Motion
- **Backend:** Express, better-sqlite3, JWT auth, bcrypt
- **Data:** TMDB API
