// src/functions/tmdb.js
const axios = require('axios');

const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

// Required by TMDB's API terms wherever their data is shown.
const TMDB_ATTRIBUTION = 'Movie data from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.';

function isTmdbConfigured() {
  return Boolean(process.env.TMDB_API_KEY?.trim());
}

// TMDB gives out two kinds of credentials: a short v3 "API Key" and a long
// v4 "API Read Access Token" (starts with "eyJ"). Either one works here.
function getAuth() {
  const key = process.env.TMDB_API_KEY?.trim();

  if (!key) {
    throw new Error('Missing TMDB_API_KEY in environment variables.');
  }

  return key.startsWith('eyJ')
    ? { headers: { Authorization: `Bearer ${key}` }, params: {} }
    : { headers: {}, params: { api_key: key } };
}

async function tmdbGet(endpoint, params = {}) {
  const auth = getAuth();

  const response = await axios.get(`${TMDB_API_BASE}${endpoint}`, {
    headers: auth.headers,
    params: { language: 'en-US', ...auth.params, ...params },
    timeout: 10000,
  });

  return response.data;
}

function getYear(releaseDate) {
  return releaseDate ? releaseDate.slice(0, 4) : null;
}

async function searchMovies(query, limit = 5) {
  const data = await tmdbGet('/search/movie', {
    query,
    include_adult: false,
    page: 1,
  });

  return (data.results || []).slice(0, limit).map(result => ({
    tmdbId: result.id,
    title: result.title || 'Unknown Title',
    year: getYear(result.release_date),
  }));
}

async function getMovieDetails(tmdbId) {
  const movie = await tmdbGet(`/movie/${tmdbId}`);

  return {
    tmdbId: movie.id,
    title: movie.title || 'Unknown Title',
    year: getYear(movie.release_date),
    overview: movie.overview || null,
    posterUrl: movie.poster_path ? `${TMDB_IMAGE_BASE}/w500${movie.poster_path}` : null,
    runtime: Number.isFinite(movie.runtime) && movie.runtime > 0 ? movie.runtime : null,
    genres: Array.isArray(movie.genres) ? movie.genres.map(genre => genre.name) : [],
    rating: movie.vote_count > 0 && Number.isFinite(movie.vote_average)
      ? Math.round(movie.vote_average * 10) / 10
      : null,
    tmdbUrl: `https://www.themoviedb.org/movie/${movie.id}`,
  };
}

// Accepts either an autocomplete pick ("tmdb:12345") or free text the user
// typed without picking a suggestion, in which case the best match is used.
async function resolveMovie(input) {
  const pickedId = String(input).match(/^tmdb:(\d+)$/);

  if (pickedId) {
    return getMovieDetails(pickedId[1]);
  }

  const [bestMatch] = await searchMovies(input, 1);
  return bestMatch ? getMovieDetails(bestMatch.tmdbId) : null;
}

function formatMovieLabel(movie) {
  return movie.year ? `${movie.title} (${movie.year})` : movie.title;
}

async function searchMoviesForAutocomplete(query) {
  if (!query || !query.trim() || !isTmdbConfigured()) return [];

  try {
    const results = await searchMovies(query, 10);

    return results.map(movie => ({
      name: formatMovieLabel(movie).slice(0, 100),
      value: `tmdb:${movie.tmdbId}`,
    }));
  } catch (error) {
    console.error('Autocomplete movie search failed:', error.message);
    return [];
  }
}

module.exports = {
  TMDB_ATTRIBUTION,
  isTmdbConfigured,
  searchMovies,
  getMovieDetails,
  resolveMovie,
  formatMovieLabel,
  searchMoviesForAutocomplete,
};
