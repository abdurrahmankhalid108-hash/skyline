# Skyline — Live Weather

**Live demo:** https://abdurrahmankhalid108-hash.github.io/skyline/

A real-time weather dashboard that refreshes itself **every hour**, built with plain HTML/CSS/JS and [Open-Meteo](https://open-meteo.com/). No API key, no build step.

![Live weather dashboard](https://img.shields.io/badge/data-Open--Meteo-38bdf8)

## Features

- **Light, minimal interface** — white cards, soft sky-tinted canvas, crisp Manrope typography and line icons
- **Live current conditions** — temperature, feels-like, condition, humidity, wind, gusts, pressure, cloud cover, precipitation, sunrise and sunset
- **24-hour temperature sparkline** in the hero, plus a scrollable hourly strip with rain probability
- **Auto-refresh every hour**, with a live countdown and a manual refresh button
- **7-day forecast** — daily highs/lows with a visual temperature range bar
- **City search** with autocomplete (keyboard and mouse), country flags/codes
- **Use my location** via the browser Geolocation API with reverse geocoding
- **°C / °F toggle** — changes temperature, wind and precipitation units, and refetches
- Remembers your last city and unit in `localStorage`
- Local time clock for the selected city, ticking every second
- Weather-driven accent themes (clear, cloudy, rain, snow, storm, fog — day and night) stay light but shift the glow and accent color
- Responsive layout, accessible labels/live regions, reduced-motion support
- Graceful errors with a retry button, and automatic retry 5 minutes after a failure

## Run it

```bash
cd weather-app
npm start
```

Open http://localhost:3001.

Node 18+ is required (uses the built-in `fetch`). There are no dependencies.

For auto-restart during development:

```bash
npm run dev
```

Use a different port with `PORT=4000 npm start` (PowerShell: `$env:PORT=4000; npm start`).

## How the hourly refresh works

- After every successful load, a timer is scheduled for **60 minutes** (`REFRESH_MS`).
- A countdown in the hero shows exactly when the next refresh happens.
- `setTimeout` is throttled in background tabs, so the app also checks on `visibilitychange`: if the page becomes visible and the data is older than an hour, it refreshes immediately.
- Manual refresh never interferes with the schedule — it resets the hour from the latest successful load.
- If a refresh fails, the last data stays on screen, an error banner appears, and a retry is scheduled after 5 minutes.

## Project structure

```
weather-app/
├── server.js            # Zero-dependency static file server
└── public/
    ├── index.html       # Layout: search, hero, details, hourly, 7-day
    ├── styles.css       # Glass UI + weather-driven themes
    └── app.js           # API calls, validation, rendering, refresh timers
```

## Data sources

| API | Used for | Key required |
| --- | --- | --- |
| `api.open-meteo.com/v1/forecast` | Current, hourly and daily weather | No |
| `geocoding-api.open-meteo.com/v1/search` | City search | No |
| `api.bigdatacloud.net/data/reverse-geocode-client` | Naming your geolocation | No |

The app calls these directly from the browser; Open-Meteo sends CORS headers.
Open-Meteo's free tier is for non-commercial use — check their terms before a
commercial launch, or swap in a keyed provider inside `loadWeather()`.

## Tests performed

Verified with Playwright against the running app:

- 24 hourly cards, 7 daily rows, 8 detail tiles render
- Auto-refresh countdown ticks (`60:00` → `59:58`) and the city clock ticks every second
- City search with keyboard (`ArrowDown` + `Enter`) selects Paris
- °C → °F conversion (23 °C → 73 °F) persists across reloads
- Geolocation resolves London via reverse geocoding
- Simulated network failure shows the banner; retry recovers and hides it
- No horizontal page overflow at 390 px or 1280 px viewports
