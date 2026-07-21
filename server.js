const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// Clave API de TMDB desde variables de entorno
const TMDB_API_KEY = process.env.TMDB_API_KEY || 'TU_API_KEY_AQUI';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// ==========================================
// CONFIGURACIÓN DE SERVIDORES DE STREAMING
// ==========================================
const PROVIDERS = [
  // Red VidSrc (Principal)
  {
    id: 1,
    name: 'vidsrc.pro',
    url: (type, id, s = 1, e = 1) =>
      type === 'movie'
        ? `https://vidsrc.pro/embed/movie/${id}`
        : `https://vidsrc.pro/embed/tv/${id}/${s}/${e}`
  },
  // Red MultiEmbed (Independiente)
  {
    id: 2,
    name: 'multiembed',
    url: (type, id, s = 1, e = 1) =>
      type === 'movie'
        ? `https://multiembed.mov/directstream.php?video_id=${id}`
        : `https://multiembed.mov/directstream.php?video_id=${id}&s=${s}&e=${e}`
  },
  // Red AutoEmbed (Infraestructura separada)
  {
    id: 3,
    name: 'autoembed',
    url: (type, id, s = 1, e = 1) =>
      type === 'movie'
        ? `https://player.autoembed.cc/embed/movie/${id}`
        : `https://player.autoembed.cc/embed/tv/${id}/${s}/${e}`
  },
  // Red 2Embed (Muy estable para pelis/series en español/sub)
  {
    id: 4,
    name: '2embed',
    url: (type, id, s = 1, e = 1) =>
      type === 'movie'
        ? `https://www.2embed.cc/embed/${id}`
        : `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`
  },
  // Red Smashystream
  {
    id: 5,
    name: 'smashystream',
    url: (type, id, s = 1, e = 1) =>
      type === 'movie'
        ? `https://embed.smashystream.com/playere.php?tmdb=${id}`
        : `https://embed.smashystream.com/playere.php?tmdb=${id}&s=${s}&e=${e}`
  },
  // Red VidSrc me (Mirror alternativo)
  {
    id: 6,
    name: 'vidsrc.me',
    url: (type, id, s = 1, e = 1) =>
      type === 'movie'
        ? `https://vidsrc.me/embed/movie?tmdb=${id}`
        : `https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}`
  },
  // Red NontonGo
  {
    id: 7,
    name: 'nontongo',
    url: (type, id, s = 1, e = 1) =>
      type === 'movie'
        ? `https://www.NontonGo.win/embed/movie/${id}`
        : `https://www.NontonGo.win/embed/tv/${id}/${s}/${e}`
  },
  // Red MovieAPI
  {
    id: 8,
    name: 'movieapi',
    url: (type, id, s = 1, e = 1) =>
      type === 'movie'
        ? `https://movieapi.club/movie/${id}`
        : `https://movieapi.club/tv/${id}-${s}-${e}`
  },
  // Red SuperEmbed
  {
    id: 9,
    name: 'superembed',
    url: (type, id, s = 1, e = 1) =>
      type === 'movie'
        ? `https://seapi.link/auto.php?video_id=${id}`
        : `https://seapi.link/auto.php?video_id=${id}&s=${s}&e=${e}`
  },
  // Red VidSrc.in
  {
    id: 10,
    name: 'vidsrc.in',
    url: (type, id, s = 1, e = 1) =>
      type === 'movie'
        ? `https://vidsrc.in/embed/movie/${id}`
        : `https://vidsrc.in/embed/tv/${id}/${s}/${e}`
  }
];

// Devolver el proveedor principal por defecto
const getStreamUrl = (type, id, season = 1, episode = 1, index = 0) => {
  const provider = PROVIDERS[index] || PROVIDERS[0];
  return provider.url(type, id, season, episode);
};

// ==========================================
// FUNCIÓN AUXILIAR PARA PETICIONES A TMDB
// ==========================================
const fetchTMDB = async (url, params = {}) => {
  const res = await axios({
    method: 'GET',
    url: url,
    params: {
      api_key: TMDB_API_KEY,
      language: 'es-MX',
      ...params
    },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
    },
    timeout: 8000
  });
  return res.data;
};

// ==========================================
// ENDPOINTS DE LA API
// ==========================================

// Endpoint para obtener servidores activos disponibles
app.get('/api/get-stream', async (req, res) => {
  const { id, type = 'movie', s = 1, e = 1 } = req.query;

  if (!id) {
    return res.status(400).json({ success: false, message: 'ID es requerido' });
  }

  // Recorrer los proveedores hasta encontrar uno disponible
  for (let provider of PROVIDERS) {
    const streamUrl = provider.url(type, id, s, e);
    try {
      const response = await axios.get(streamUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 4000
      });

      if (response.status === 200) {
        return res.json({ success: true, stream: streamUrl, provider: provider.name });
      }
    } catch (err) {
      // Si falla, ignora y prueba el siguiente
      console.warn(`[Stream Check] Proveedor ${provider.name} falló para ID ${id}. Probando siguiente...`);
    }
  }

  // Si ninguno responde, devuelve el primero como último recurso
  res.json({
    success: false,
    message: 'Ningún servidor respondió a la verificación previa',
    fallbackStream: getStreamUrl(type, id, s, e, 0)
  });
});

// Endpoint de búsqueda global (Lupa)
app.get('/api/buscar', async (req, res) => {
  const { query, page = 1 } = req.query;

  if (!query) {
    return res.status(400).json({ success: false, message: 'Query requerida' });
  }

  try {
    const data = await fetchTMDB(`${TMDB_BASE_URL}/search/multi`, { query, page });
    const items = data.results
      .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
      .map(item => {
        const isMovie = item.media_type === 'movie';
        return {
          id: item.id,
          title: isMovie ? item.title : item.name,
          poster: item.poster_path
            ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
            : 'https://via.placeholder.com/500x750?text=Sin+Imagen',
          type: isMovie ? 'movie' : 'tv',
          overview: item.overview || 'Sin descripción disponible.',
          year: (isMovie ? item.release_date : item.first_air_date)
            ? (isMovie ? item.release_date : item.first_air_date).substring(0, 4)
            : '',
          stream: getStreamUrl(isMovie ? 'movie' : 'tv', item.id)
        };
      });

    res.json({
      success: true,
      data: items,
      total_pages: data.total_pages,
      page: data.page
    });
  } catch (error) {
    console.error('Error en /api/buscar:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint para Películas
app.get('/api/peliculas', async (req, res) => {
  const { page = 1 } = req.query;

  try {
    const data = await fetchTMDB(`${TMDB_BASE_URL}/discover/movie`, {
      page,
      sort_by: 'popularity.desc'
    });

    const peliculas = data.results.map(movie => ({
      id: movie.id,
      title: movie.title,
      poster: movie.poster_path
        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
        : 'https://via.placeholder.com/500x750?text=Sin+Imagen',
      type: 'movie',
      overview: movie.overview || 'Sin descripción disponible.',
      year: movie.release_date ? movie.release_date.substring(0, 4) : '',
      stream: getStreamUrl('movie', movie.id)
    }));

    res.json({
      success: true,
      data: peliculas,
      total_pages: data.total_pages,
      page: data.page
    });
  } catch (error) {
    console.error('Error en /api/peliculas:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint para Series
app.get('/api/series', async (req, res) => {
  const { page = 1 } = req.query;

  try {
    const data = await fetchTMDB(`${TMDB_BASE_URL}/discover/tv`, {
      page,
      sort_by: 'popularity.desc'
    });

    const series = data.results.map(show => ({
      id: show.id,
      title: show.name,
      poster: show.poster_path
        ? `https://image.tmdb.org/t/p/w500${show.poster_path}`
        : 'https://via.placeholder.com/500x750?text=Sin+Imagen',
      type: 'tv',
      overview: show.overview || 'Sin descripción disponible.',
      year: show.first_air_date ? show.first_air_date.substring(0, 4) : '',
      stream: getStreamUrl('tv', show.id)
    }));

    res.json({
      success: true,
      data: series,
      total_pages: data.total_pages,
      page: data.page
    });
  } catch (error) {
    console.error('Error en /api/series:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint para Animes
app.get('/api/animes', async (req, res) => {
  const { page = 1 } = req.query;

  try {
    const data = await fetchTMDB(`${TMDB_BASE_URL}/discover/tv`, {
      page,
      with_original_language: 'ja',
      sort_by: 'popularity.desc'
    });

    const animes = data.results.map(anime => ({
      id: anime.id,
      title: anime.name,
      poster: anime.poster_path
        ? `https://image.tmdb.org/t/p/w500${anime.poster_path}`
        : 'https://via.placeholder.com/500x750?text=Sin+Imagen',
      type: 'tv',
      overview: anime.overview || 'Sin descripción disponible.',
      year: anime.first_air_date ? anime.first_air_date.substring(0, 4) : '',
      stream: getStreamUrl('tv', anime.id)
    }));

    res.json({
      success: true,
      data: animes,
      total_pages: data.total_pages,
      page: data.page
    });
  } catch (error) {
    console.error('Error en /api/animes:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ARCHIVOS ESTÁTICOS Y SPA (RAÍZ DEL PROYECTO)
// ==========================================
app.use(express.static(path.join(__dirname)));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 [OK] Servidor corriendo en el puerto ${PORT}`);
});
