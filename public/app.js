'use strict';

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const REVERSE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

const REFRESH_MS = 60 * 60 * 1000; // 1 hour
const RETRY_MS = 5 * 60 * 1000; // 5 minutes after a failure
const STORAGE_PLACE = 'skyline.place';
const STORAGE_UNIT = 'skyline.unit';

/* ------------------------------------------------------------------ */
/* Weather codes (WMO)                                                 */
/* ------------------------------------------------------------------ */

const WMO = {
  0: { label: 'Clear sky', day: '☀️', night: '🌙', theme: 'clear' },
  1: { label: 'Mainly clear', day: '🌤️', night: '🌙', theme: 'clear' },
  2: { label: 'Partly cloudy', day: '⛅', night: '☁️', theme: 'cloudy' },
  3: { label: 'Overcast', day: '☁️', night: '☁️', theme: 'cloudy' },
  45: { label: 'Fog', day: '🌫️', night: '🌫️', theme: 'fog' },
  48: { label: 'Rime fog', day: '🌫️', night: '🌫️', theme: 'fog' },
  51: { label: 'Light drizzle', day: '🌦️', night: '🌧️', theme: 'rain' },
  53: { label: 'Drizzle', day: '🌦️', night: '🌧️', theme: 'rain' },
  55: { label: 'Heavy drizzle', day: '🌧️', night: '🌧️', theme: 'rain' },
  56: { label: 'Freezing drizzle', day: '🌧️', night: '🌧️', theme: 'rain' },
  57: { label: 'Heavy freezing drizzle', day: '🌧️', night: '🌧️', theme: 'rain' },
  61: { label: 'Light rain', day: '🌦️', night: '🌧️', theme: 'rain' },
  63: { label: 'Rain', day: '🌧️', night: '🌧️', theme: 'rain' },
  65: { label: 'Heavy rain', day: '🌧️', night: '🌧️', theme: 'rain' },
  66: { label: 'Freezing rain', day: '🌧️', night: '🌧️', theme: 'rain' },
  67: { label: 'Heavy freezing rain', day: '🌧️', night: '🌧️', theme: 'rain' },
  71: { label: 'Light snow', day: '🌨️', night: '🌨️', theme: 'snow' },
  73: { label: 'Snow', day: '🌨️', night: '🌨️', theme: 'snow' },
  75: { label: 'Heavy snow', day: '❄️', night: '❄️', theme: 'snow' },
  77: { label: 'Snow grains', day: '🌨️', night: '🌨️', theme: 'snow' },
  80: { label: 'Light showers', day: '🌦️', night: '🌧️', theme: 'rain' },
  81: { label: 'Showers', day: '🌧️', night: '🌧️', theme: 'rain' },
  82: { label: 'Violent showers', day: '⛈️', night: '⛈️', theme: 'storm' },
  85: { label: 'Light snow showers', day: '🌨️', night: '🌨️', theme: 'snow' },
  86: { label: 'Snow showers', day: '🌨️', night: '🌨️', theme: 'snow' },
  95: { label: 'Thunderstorm', day: '⛈️', night: '⛈️', theme: 'storm' },
  96: { label: 'Thunderstorm with hail', day: '⛈️', night: '⛈️', theme: 'storm' },
  99: { label: 'Severe thunderstorm', day: '⛈️', night: '⛈️', theme: 'storm' },
};

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/* ------------------------------------------------------------------ */
/* Elements & state                                                    */
/* ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);

const els = {
  form: $('search-form'),
  input: $('search-input'),
  suggestions: $('suggestions'),
  locate: $('locate-btn'),
  unit: $('unit-toggle'),
  refresh: $('refresh-btn'),
  error: $('error-banner'),
  errorText: $('error-text'),
  retry: $('retry-btn'),
  weather: $('weather'),
  placeName: $('place-name'),
  placeMeta: $('place-meta'),
  localTime: $('local-time'),
  localDate: $('local-date'),
  icon: $('current-icon'),
  temp: $('current-temp'),
  unitLabel: $('temp-unit'),
  condition: $('condition'),
  feels: $('feels'),
  range: $('range'),
  updated: $('updated'),
  nextRefresh: $('next-refresh'),
  details: $('details'),
  hourly: $('hourly'),
  daily: $('daily'),
  weekRange: $('week-range'),
  heroChart: $('hero-chart'),
  chartSvg: $('chart-svg'),
  chartRange: $('chart-range'),
};

const state = {
  unit: localStorage.getItem(STORAGE_UNIT) === 'f' ? 'f' : 'c',
  place: readPlace(),
  data: null,
  lastUpdated: 0,
  nextRefreshAt: 0,
  requestId: 0,
  refreshTimer: null,
  clockTimer: null,
  options: [],
  activeIndex: -1,
  searchSeq: 0,
};

let inputTimer;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const round = (value) => Math.round(Number(value) || 0);
const unitSymbol = () => (state.unit === 'f' ? '°F' : '°C');
const windUnit = () => (state.unit === 'f' ? 'mph' : 'km/h');
const precipUnit = () => (state.unit === 'f' ? 'in' : 'mm');
const timeOf = (iso) => (typeof iso === 'string' ? iso.slice(11, 16) : '—');

function describe(code, isDay = 1) {
  const info = WMO[code] || { label: 'Unknown conditions', day: '🌡️', night: '🌡️', theme: 'cloudy' };
  return { ...info, icon: isDay ? info.day : info.night };
}

const lineIcon = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const DETAIL_ICONS = {
  humidity: lineIcon('<path d="M12 3.5c3.1 3.6 5.5 6.5 5.5 9.5a5.5 5.5 0 0 1-11 0c0-3 2.4-5.9 5.5-9.5Z"/>'),
  wind: lineIcon(
    '<path d="M3 8h9.5a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3 12h13a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3 16h6"/>',
  ),
  gusts: lineIcon(
    '<path d="M3 7h7"/><path d="M3 12h14a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3 17h10a2.5 2.5 0 1 1-2.5 2.5"/>',
  ),
  pressure: lineIcon(
    '<circle cx="12" cy="12" r="8.5"/><path d="M12 12l3.5-3.5"/><path d="M12 3.5v1.5"/>',
  ),
  cloud: lineIcon('<path d="M7.5 18h9a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6 1.4A3.3 3.3 0 0 0 7.5 18Z"/>'),
  precipitation: lineIcon(
    '<path d="M7.5 15h9a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6 1.4A3.3 3.3 0 0 0 7.5 15Z"/><path d="M8 18.5V20M12 18.5V20M16 18.5V20"/>',
  ),
  sunrise: lineIcon(
    '<path d="M3 19h18"/><path d="M6.5 15a5.5 5.5 0 0 1 11 0"/><path d="M12 3v4"/><path d="m9.5 5.5 2.5-2.5 2.5 2.5"/><path d="M4.5 9.5 6 11"/><path d="M19.5 9.5 18 11"/>',
  ),
  sunset: lineIcon(
    '<path d="M3 19h18"/><path d="M6.5 15a5.5 5.5 0 0 1 11 0"/><path d="M12 3v4"/><path d="m9.5 4.5 2.5 2.5 2.5-2.5"/><path d="M4.5 9.5 6 11"/><path d="M19.5 9.5 18 11"/>',
  ),
};

function compass(degrees) {
  const index = Math.round((((Number(degrees) || 0) % 360) + 360) % 360 / 22.5) % 16;
  return COMPASS[index];
}

function flag(countryCode) {
  if (!countryCode || countryCode.length !== 2) return '📍';
  return String.fromCodePoint(...[...countryCode.toUpperCase()].map((char) => 127397 + char.charCodeAt(0)));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

function readPlace() {
  try {
    const place = JSON.parse(localStorage.getItem(STORAGE_PLACE) || 'null');
    if (
      place &&
      typeof place.name === 'string' &&
      Number.isFinite(place.latitude) &&
      Number.isFinite(place.longitude)
    ) {
      return place;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

function savePlace(place) {
  try {
    localStorage.setItem(STORAGE_PLACE, JSON.stringify(place));
  } catch {
    /* storage may be unavailable */
  }
}

function pickPlace(geo) {
  return {
    name: geo.name,
    admin1: geo.admin1,
    country: geo.country,
    country_code: geo.country_code,
    latitude: geo.latitude,
    longitude: geo.longitude,
  };
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

async function geocode(query) {
  const res = await fetch(`${GEO_URL}?name=${encodeURIComponent(query)}&count=6&language=en&format=json`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = await res.json();
  return Array.isArray(data.results) ? data.results : [];
}

function hideSuggestions() {
  state.options = [];
  state.activeIndex = -1;
  els.suggestions.hidden = true;
  els.suggestions.innerHTML = '';
  els.input.setAttribute('aria-expanded', 'false');
  els.input.removeAttribute('aria-activedescendant');
}

function renderSuggestions(places) {
  state.options = places;
  state.activeIndex = -1;

  if (places.length === 0) {
    hideSuggestions();
    return;
  }

  els.suggestions.innerHTML = places
    .map(
      (place, index) => `
        <li role="option" id="suggestion-${index}" aria-selected="false">
          <button type="button" data-index="${index}">
            <span class="suggestion__flag" aria-hidden="true">${flag(place.country_code)}</span>
            <span class="suggestion__text">
              <strong>${escapeHtml(place.name)}</strong>
              <small>${escapeHtml([place.admin1, place.country].filter(Boolean).join(', '))}</small>
            </span>
          </button>
        </li>`,
    )
    .join('');

  els.suggestions.hidden = false;
  els.input.setAttribute('aria-expanded', 'true');

  for (const button of els.suggestions.querySelectorAll('button')) {
    button.addEventListener('click', () => {
      const place = state.options[Number(button.dataset.index)];
      if (place) choosePlace(place);
    });
  }
}

function setActive(index) {
  if (state.options.length === 0) return;

  state.activeIndex = (index + state.options.length) % state.options.length;
  els.input.setAttribute('aria-activedescendant', `suggestion-${state.activeIndex}`);

  [...els.suggestions.children].forEach((item, idx) => {
    const button = item.querySelector('button');
    item.setAttribute('aria-selected', String(idx === state.activeIndex));
    button.classList.toggle('is-active', idx === state.activeIndex);
    if (idx === state.activeIndex) button.scrollIntoView({ block: 'nearest' });
  });
}

async function loadSuggestions(query) {
  const seq = ++state.searchSeq;
  try {
    const places = await geocode(query);
    if (seq !== state.searchSeq) return;
    renderSuggestions(places);
  } catch {
    if (seq === state.searchSeq) hideSuggestions();
  }
}

function setPlace(place) {
  state.place = place;
  savePlace(place);
  renderPlaceHeader();
}

function choosePlace(geo) {
  setPlace(pickPlace(geo));
  els.input.value = '';
  els.input.blur();
  hideSuggestions();
  loadWeather();
}

els.input.addEventListener('input', () => {
  clearTimeout(inputTimer);
  const query = els.input.value.trim();
  if (query.length < 2) {
    hideSuggestions();
    return;
  }
  inputTimer = setTimeout(() => loadSuggestions(query), 280);
});

els.input.addEventListener('keydown', (event) => {
  if (els.suggestions.hidden) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    setActive(state.activeIndex + 1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    setActive(state.activeIndex - 1);
  } else if (event.key === 'Escape') {
    hideSuggestions();
  } else if (event.key === 'Enter' && state.activeIndex >= 0) {
    event.preventDefault();
    const place = state.options[state.activeIndex];
    if (place) choosePlace(place);
  }
});

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = els.input.value.trim();

  if (state.activeIndex >= 0 && state.options[state.activeIndex]) {
    choosePlace(state.options[state.activeIndex]);
    return;
  }
  if (!query) return;

  try {
    const places = await geocode(query);
    if (places[0]) {
      choosePlace(places[0]);
    } else {
      showError(`No places found for “${query}”. Try another spelling.`);
    }
  } catch {
    showError('Could not search for that place. Check your connection and try again.');
  }
});

document.addEventListener('click', (event) => {
  if (
    !els.suggestions.hidden &&
    !els.suggestions.contains(event.target) &&
    !els.form.contains(event.target)
  ) {
    hideSuggestions();
  }
});

/* ------------------------------------------------------------------ */
/* Weather                                                             */
/* ------------------------------------------------------------------ */

async function loadWeather({ silent = false } = {}) {
  if (!state.place) return;

  const requestId = ++state.requestId;
  setLoading(true);
  if (!silent) hideError();

  const { latitude, longitude } = state.place;

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '7',
    temperature_unit: state.unit === 'f' ? 'fahrenheit' : 'celsius',
    wind_speed_unit: state.unit === 'f' ? 'mph' : 'kmh',
    precipitation_unit: state.unit === 'f' ? 'inch' : 'mm',
  });

  try {
    const response = await fetch(`${FORECAST_URL}?${params.toString()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Weather service returned HTTP ${response.status}`);

    const data = await response.json();
    if (!data.current || !data.hourly || !data.daily) throw new Error('Incomplete weather response');
    if (requestId !== state.requestId) return;

    state.data = data;
    state.lastUpdated = Date.now();
    if (data.timezone) state.place.timezone = data.timezone;

    hideError();
    render();
    scheduleRefresh(REFRESH_MS);
  } catch (error) {
    if (requestId !== state.requestId) return;

    const detail = error.message.startsWith('Weather service') ? error.message : 'Check your internet connection.';
    showError(`Couldn't load live weather${state.place.name ? ` for ${state.place.name}` : ''}. ${detail}`);
    scheduleRefresh(RETRY_MS);
  } finally {
    if (requestId === state.requestId) setLoading(false);
  }
}

function scheduleRefresh(delay) {
  clearTimeout(state.refreshTimer);
  state.nextRefreshAt = Date.now() + delay;
  state.refreshTimer = setTimeout(() => loadWeather({ silent: true }), delay);
  updateMeta();
}

function render() {
  const { current, hourly, daily } = state.data;
  const isDay = current.is_day === 1;
  const info = describe(current.weather_code, isDay);

  document.body.dataset.theme = `${info.theme}-${isDay ? 'day' : 'night'}`;

  renderPlaceHeader();

  els.icon.textContent = info.icon;
  els.temp.textContent = round(current.temperature_2m);
  els.unitLabel.textContent = unitSymbol();
  els.condition.textContent = info.label;
  els.feels.textContent = `Feels like ${round(current.apparent_temperature)}°`;
  els.range.textContent = `H ${round(daily.temperature_2m_max[0])}° · L ${round(daily.temperature_2m_min[0])}°`;

  renderDetails(current, daily);
  renderHourly(current, hourly);
  renderChart(current, hourly);
  renderDaily(daily);
  startClock(state.data.timezone);
  updateMeta();
}

function renderPlaceHeader() {
  if (!state.place) return;
  els.placeName.textContent = state.place.name || 'Unknown place';
  els.placeMeta.textContent = [state.place.admin1, state.place.country].filter(Boolean).join(', ') || 'Live conditions';
}

function renderDetails(current, daily) {
  const items = [
    { icon: DETAIL_ICONS.humidity, label: 'Humidity', value: `${round(current.relative_humidity_2m)}<span class="unit">%</span>` },
    {
      icon: DETAIL_ICONS.wind,
      label: 'Wind',
      value: `${round(current.wind_speed_10m)}<span class="unit">${windUnit()}</span>`,
      sub: `from ${compass(current.wind_direction_10m)}`,
    },
    { icon: DETAIL_ICONS.gusts, label: 'Gusts', value: `${round(current.wind_gusts_10m)}<span class="unit">${windUnit()}</span>` },
    { icon: DETAIL_ICONS.pressure, label: 'Pressure', value: `${round(current.pressure_msl)}<span class="unit">hPa</span>` },
    { icon: DETAIL_ICONS.cloud, label: 'Cloud cover', value: `${round(current.cloud_cover)}<span class="unit">%</span>` },
    {
      icon: DETAIL_ICONS.precipitation,
      label: 'Precipitation',
      value: `${Number(current.precipitation || 0).toFixed(1)}<span class="unit">${precipUnit()}</span>`,
    },
    { icon: DETAIL_ICONS.sunrise, label: 'Sunrise', value: timeOf(daily.sunrise[0]) },
    { icon: DETAIL_ICONS.sunset, label: 'Sunset', value: timeOf(daily.sunset[0]) },
  ];

  els.details.innerHTML = items
    .map(
      (item) => `
        <div class="detail">
          <span class="detail__icon" aria-hidden="true">${item.icon}</span>
          <span class="detail__label">${item.label}</span>
          <span class="detail__value">${item.value}</span>
          ${item.sub ? `<span class="detail__sub">${item.sub}</span>` : ''}
        </div>`,
    )
    .join('');
}

function hourlyStart(current, hourly) {
  const currentKey = String(current.time).slice(0, 13);
  const index = hourly.time.findIndex((time) => time.slice(0, 13) >= currentKey);
  return index < 0 ? 0 : index;
}

function renderHourly(current, hourly) {
  const start = hourlyStart(current, hourly);
  const end = Math.min(start + 24, hourly.time.length);
  const cards = [];

  for (let i = start; i < end; i++) {
    const hour = Number(hourly.time[i].slice(11, 13));
    const isNow = i === start;
    const info = describe(hourly.weather_code[i], hourly.is_day?.[i] ?? 1);
    const pop = hourly.precipitation_probability?.[i];

    cards.push(`
      <div class="hour">
        <span class="hour__time">${isNow ? 'Now' : `${String(hour).padStart(2, '0')}:00`}</span>
        <span class="hour__icon" aria-hidden="true">${info.icon}</span>
        <span class="hour__temp">${round(hourly.temperature_2m[i])}°</span>
        <span class="hour__pop">${pop != null && pop >= 10 ? `💧${pop}%` : ''}</span>
        <span class="sr-only">${info.label}</span>
      </div>`);
  }

  els.hourly.innerHTML = cards.join('');
}

function renderChart(current, hourly) {
  const start = hourlyStart(current, hourly);
  const end = Math.min(start + 24, hourly.time.length);
  const temps = hourly.temperature_2m.slice(start, end);

  if (temps.length < 2) {
    els.heroChart.hidden = true;
    return;
  }

  const width = 600;
  const height = 96;
  const padX = 4;
  const padY = 12;
  const low = Math.min(...temps);
  const high = Math.max(...temps);
  const span = Math.max(high - low, 1);

  const points = temps.map((temp, index) => {
    const x = padX + (index / (temps.length - 1)) * (width - padX * 2);
    const y = height - padY - ((temp - low) / span) * (height - padY * 2);
    return [x, y];
  });

  const line = points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');
  const last = points[points.length - 1];
  const first = points[0];
  const area = `${line} L ${last[0].toFixed(1)} ${height} L ${first[0].toFixed(1)} ${height} Z`;

  els.chartSvg.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img"
      aria-label="Temperature trend over the next 24 hours, from ${round(low)} to ${round(high)} degrees">
      <defs>
        <linearGradient id="heroChartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="currentColor" stop-opacity="0.24" />
          <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#heroChartFill)" />
      <path d="${line}" fill="none" stroke="currentColor" stroke-width="2.2"
        vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.4" fill="currentColor" />
    </svg>`;

  els.chartRange.textContent = `${round(low)}° – ${round(high)}°`;
  els.heroChart.hidden = false;
}

function renderDaily(daily) {
  const lows = daily.temperature_2m_min;
  const highs = daily.temperature_2m_max;
  const weekLow = Math.min(...lows);
  const weekHigh = Math.max(...highs);
  const span = Math.max(weekHigh - weekLow, 1);

  els.weekRange.textContent = `L ${round(weekLow)}° · H ${round(weekHigh)}°`;

  els.daily.innerHTML = daily.time
    .map((dateString, index) => {
      const info = describe(daily.weather_code[index], 1);
      const name =
        index === 0
          ? 'Today'
          : index === 1
            ? 'Tomorrow'
            : new Date(`${dateString}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' });

      const low = round(lows[index]);
      const high = round(highs[index]);
      const offset = ((lows[index] - weekLow) / span) * 100;
      const width = Math.max(((highs[index] - lows[index]) / span) * 100, 6);
      const pop = daily.precipitation_probability_max?.[index];

      return `
        <li class="day">
          <span class="day__name">${name}</span>
          <span class="day__icon" aria-hidden="true">${info.icon}</span>
          <span class="day__pop">${pop != null && pop >= 10 ? `${pop}%` : ''}</span>
          <span class="day__low">${low}°</span>
          <span class="day__bar" role="img" aria-label="Low ${low} to high ${high} degrees">
            <span class="day__fill" style="left:${offset}%;width:${width}%"></span>
          </span>
          <span class="day__high">${high}°</span>
          <span class="sr-only">${info.label}</span>
        </li>`;
    })
    .join('');
}

function startClock(timeZone) {
  clearInterval(state.clockTimer);
  if (!timeZone) return;

  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const dateFmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const tick = () => {
    const now = new Date();
    els.localTime.textContent = timeFmt.format(now);
    els.localDate.textContent = dateFmt.format(now);
  };

  tick();
  state.clockTimer = setInterval(tick, 1000);
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

function setLoading(isLoading) {
  els.refresh.classList.toggle('is-loading', isLoading);
  els.refresh.disabled = isLoading;
  els.weather.setAttribute('aria-busy', String(isLoading));
}

function showError(message) {
  els.errorText.textContent = message;
  els.error.hidden = false;
}

function hideError() {
  els.error.hidden = true;
}

function updateMeta() {
  if (!state.lastUpdated) {
    els.updated.textContent = 'Fetching live weather…';
  } else {
    const age = Date.now() - state.lastUpdated;
    if (age < 5000) els.updated.textContent = 'Updated just now';
    else if (age < 60_000) els.updated.textContent = `Updated ${Math.max(1, Math.floor(age / 1000))}s ago`;
    else if (age < 3_600_000) els.updated.textContent = `Updated ${Math.floor(age / 60_000)} min ago`;
    else els.updated.textContent = 'Updating…';
  }

  if (!state.nextRefreshAt) {
    els.nextRefresh.textContent = '';
    return;
  }

  const remaining = Math.max(0, state.nextRefreshAt - Date.now());
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  els.nextRefresh.textContent = `Next refresh in ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateUnitUI() {
  els.unit.textContent = unitSymbol();
  const target = state.unit === 'c' ? 'Fahrenheit' : 'Celsius';
  els.unit.setAttribute('aria-label', `Switch to ${target}`);
  els.unit.title = `Switch to ${target}`;
  els.unitLabel.textContent = unitSymbol();
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

els.refresh.addEventListener('click', () => loadWeather({ silent: true }));

els.retry.addEventListener('click', () => loadWeather({ silent: true }));

els.unit.addEventListener('click', () => {
  state.unit = state.unit === 'c' ? 'f' : 'c';
  try {
    localStorage.setItem(STORAGE_UNIT, state.unit);
  } catch {
    /* ignore */
  }
  updateUnitUI();
  if (state.place) loadWeather({ silent: true });
});

els.locate.addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    showError('This browser does not support location access.');
    return;
  }

  els.locate.disabled = true;
  els.locate.setAttribute('aria-busy', 'true');

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      const place = { name: 'My location', latitude, longitude };

      try {
        const res = await fetch(
          `${REVERSE_URL}?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
          { cache: 'no-store' },
        );
        if (res.ok) {
          const geo = await res.json();
          place.name = geo.city || geo.locality || geo.principalSubdivision || 'My location';
          place.admin1 = geo.principalSubdivision;
          place.country = geo.countryName;
          place.country_code = geo.countryCode;
        }
      } catch {
        /* coordinates alone are enough */
      }

      setPlace(place);
      els.locate.disabled = false;
      els.locate.removeAttribute('aria-busy');
      loadWeather();
    },
    (error) => {
      els.locate.disabled = false;
      els.locate.removeAttribute('aria-busy');
      const reason =
        error.code === error.PERMISSION_DENIED
          ? 'Location permission was denied. Search for a city instead.'
          : 'Could not get your location. Search for a city instead.';
      showError(reason);
    },
    { timeout: 10_000, maximumAge: 5 * 60_000 },
  );
});

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

async function detectDefaultPlace() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const city = timeZone.split('/').pop()?.replace(/_/g, ' ').trim();

  if (city) {
    try {
      const places = await geocode(city);
      if (places[0]) return pickPlace(places[0]);
    } catch {
      /* fall through */
    }
  }

  return {
    name: 'London',
    admin1: 'England',
    country: 'United Kingdom',
    country_code: 'GB',
    latitude: 51.5074,
    longitude: -0.1278,
  };
}

async function init() {
  updateUnitUI();
  updateMeta();
  setInterval(updateMeta, 1000);

  document.addEventListener('visibilitychange', () => {
    if (
      document.visibilityState === 'visible' &&
      state.lastUpdated &&
      Date.now() - state.lastUpdated >= REFRESH_MS
    ) {
      loadWeather({ silent: true });
    }
  });

  if (!state.place) {
    setPlace(await detectDefaultPlace());
  } else {
    renderPlaceHeader();
  }

  await loadWeather();
}

init();
