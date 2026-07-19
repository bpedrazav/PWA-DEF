const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Sirve tu PWA/index.html desde la raíz sin mover nada
app.use(express.static(__dirname));

const API_KEY = 'f745ccfefedb83e1edca042526da0868';

// =========================================================================
// 1. ENDPOINT DE PELÍCULAS MASIVAS
// =========================================================================
app.get('/api/peliculas', async (req, res) => {
  const page = req.query.page || 1;
  console.log(`[Peliculas] Solicitando página ${page}...`);
  try {
    const response = await axios.get(`https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&language=es-MX&sort_by=popularity.desc&page=${page}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 6000
    });
    if (response.data && response.data.results) {
      const peliculas = response.data.results.map(p => ({
        id: p.id,
        titulo: p.title,
        sinopsis: p.overview || "Sin sinopsis disponible.",
        poster: p.poster_path ? `https://image.tmdb.org/t/p/w500${p.poster_path}` : "https://via.placeholder.com/500x750?text=No+Image",
        fecha: p.release_date || "N/A",
        streamUrl: `https://vidsrc.to/embed/movie/${p.id}`
      }));
      return res.json({ success: true, page: parseInt(page), total_pages: response.data.total_pages, data: peliculas });
    }
    throw new Error("Estructura inválida");
  } catch (error) {
    console.log(`[Peliculas] Error:`, error.message);
    res.json({ success: true, page: 1, total_pages: 1, data: [] });
  }
});

// =========================================================================
// 2. ENDPOINT DE SERIES MASIVAS
// =========================================================================
app.get('/api/series', async (req, res) => {
  const page = req.query.page || 1;
  console.log(`[Series] Solicitando página ${page}...`);
  try {
    const response = await axios.get(`https://api.themoviedb.org/3/discover/tv?api_key=${API_KEY}&language=es-MX&sort_by=popularity.desc&page=${page}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 6000
    });
    if (response.data && response.data.results) {
      const series = response.data.results.map(s => ({
        id: s.id,
        titulo: s.name, // TMDB usa 'name' para series
        sinopsis: s.overview || "Sin sinopsis disponible.",
        poster: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : "https://via.placeholder.com/500x750?text=No+Image",
        fecha: s.first_air_date || "N/A",
        // El reproductor de series requiere por defecto temporada 1, episodio 1
        streamUrl: `https://vidsrc.to/embed/tv/${s.id}/1/1`
      }));
      return res.json({ success: true, page: parseInt(page), total_pages: response.data.total_pages, data: series });
    }
    throw new Error("Estructura inválida");
  } catch (error) {
    console.log(`[Series] Error:`, error.message);
    res.json({ success: true, page: 1, total_pages: 1, data: [] });
  }
});

// =========================================================================
// 3. ENDPOINT DE ANIMES MASIVOS
// =========================================================================
app.get('/api/animes', async (req, res) => {
  const page = req.query.page || 1;
  console.log(`[Animes] Solicitando página ${page}...`);
  try {
    // Filtrado por género Animación (with_genres=16) y origen Japón (with_origin_country=JP)
    const response = await axios.get(`https://api.themoviedb.org/3/discover/tv?api_key=${API_KEY}&language=es-MX&sort_by=popularity.desc&with_genres=16&with_origin_country=JP&page=${page}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 6000
    });
    if (response.data && response.data.results) {
      const animes = response.data.results.map(a => ({
        id: a.id,
        titulo: a.name,
        sinopsis: a.overview || "Sin sinopsis disponible.",
        poster: a.poster_path ? `https://image.tmdb.org/t/p/w500${a.poster_path}` : "https://via.placeholder.com/500x750?text=No+Image",
        fecha: a.first_air_date || "N/A",
        streamUrl: `https://vidsrc.to/embed/tv/${a.id}/1/1`
      }));
      return res.json({ success: true, page: parseInt(page), total_pages: response.data.total_pages, data: animes });
    }
    throw new Error("Estructura inválida");
  } catch (error) {
    console.log(`[Animes] Error:`, error.message);
    res.json({ success: true, page: 1, total_pages: 1, data: [] });
  }
});

// Ruta comodín para la SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`FlojerApp (Hub Multimedia) corriendo en el puerto ${PORT}`);
});
