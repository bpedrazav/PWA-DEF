const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// Clave API de TMDB desde variables de entorno
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// ==========================================
// CONFIGURACIÓN DE SERVIDORES DE STREAMING (DOMINIOS ACTIVOS)
// ==========================================
const PROVIDERS = [
  (type, id) => `https://vidlink.pro/${type}/${id}`,
  (type, id) => `https://vidsrc.cc/v2/embed/${type}/${id}`,
  (type, id) => `https://vidsrc.vip/embed/${type}/${id}`,
  (type, id) => `https://vidsrc.net/embed/${type}/${id}`
];

// Devuelve el proveedor principal por defecto
const getStreamerUrl = (type, id, index = 0) => {
  return PROVIDERS[index] ? PROVIDERS[index](type, id) : PROVIDERS[0](type, id);
};

// Función auxiliar para realizar peticiones a TMDB
const fetchTMDB = async (url, params = {}) => {
  const res = await axios.get(`${TMDB_BASE_URL}${url}`, {
    params: {
      api_key: TMDB_API_KEY,
      language: 'es-MX',
      ...params
    },
    timeout: 8000
  });
  return res.data;
};

// ==========================================
// ENDPOINT PARA VERIFICAR O CAMBIAR DE SERVIDOR
// ==========================================
app.get('/api/resolve-stream', async (req, res) => {
  const { type = 'movie', id } = req.query;

  if (!id) {
    return res.status(400).json({ success: false, message: 'ID es requerido' });
  }

  // Prueba los servidores en orden hasta encontrar uno activo
  for (const getUrl of PROVIDERS) {
    const testUrl = getUrl(type, id);
    try {
      const response = await axios.head(testUrl, { timeout: 3000 });
      if (response.status === 200) {
        return res.json({ success: true, url: testUrl });
      }
    } catch (e) {
      // Si falla, ignora y prueba el siguiente
    }
  }

  // Si ninguno responde, devuelve el primario como último recurso
  res.json({ success: true, url: PROVIDERS[0](type, id) });
});

// ==========================================
// ENDPOINT DE BÚSQUEDA GLOBAL (LUPA)
// ==========================================
app.get('/api/search', async (req, res) => {
  const { query, page = 1 } = req.query;
  if (!query) {
    return res.status(400).json({ success: false, message: 'Query requerida' });
  }

  try {
    const data = await fetchTMDB('/search/multi', { query, page });
    const items = data.results || [];

    res.json({
      success: true,
      page: data.page,
      total_pages: data.total_pages,
      total_results: data.total_results,
      data: items
        .filter(m => m.media_type === 'movie' || m.media_type === 'tv')
        .map(m => {
          const type = m.media_type === 'movie' ? 'movie' : 'tv';
          return {
            id: m.id,
            title: m.title || m.name,
            poster: m.poster_path
              ? `https://image.tmdb.org/t/p/w500${m.poster_path}`
              : 'https://via.placeholder.com/500x750?text=Sin-Imagen',
            overview: m.overview || 'Sin descripción disponible.',
            type: type,
            year: (m.release_date || m.first_air_date || '').substring(0, 4),
            streamer: getStreamerUrl(type, m.id)
          };
        })
    });
  } catch (error) {
    console.error('Error en /api/search:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// PELÍCULAS
// ==========================================
app.get('/api/peliculas', async (req, res) => {
  const page = req.query.page || 1;
  try {
    const data = await fetchTMDB('/discover/movie', {
      page,
      sort_by: 'popularity.desc'
    });
    const peliculas = data.results.map(m => ({
      id: m.id,
      title: m.title,
      poster: m.poster_path
        ? `https://image.tmdb.org/t/p/w500${m.poster_path}`
        : 'https://via.placeholder.com/500x750?text=Sin-Imagen',
      overview: m.overview || 'Sin descripción disponible.',
      type: 'movie',
      year: (m.release_date || '').substring(0, 4),
      streamer: getStreamerUrl('movie', m.id)
    }));

    res.json({
      success: true,
      page: data.page,
      total_pages: data.total_pages,
      data: peliculas
    });
  } catch (error) {
    console.error('Error en /api/peliculas:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// SERIES
// ==========================================
app.get('/api/series', async (req, res) => {
  const page = req.query.page || 1;
  try {
    const data = await fetchTMDB('/discover/tv', {
      page,
      sort_by: 'popularity.desc'
    });
    const series = data.results.map(m => ({
      id: m.id,
      title: m.name,
      poster: m.poster_path
        ? `https://image.tmdb.org/t/p/w500${m.poster_path}`
        : 'https://via.placeholder.com/500x750?text=Sin-Imagen',
      overview: m.overview || 'Sin descripción disponible.',
      type: 'tv',
      year: (m.first_air_date || '').substring(0, 4),
      streamer: getStreamerUrl('tv', m.id)
    }));

    res.json({
      success: true,
      page: data.page,
      total_pages: data.total_pages,
      data: series
    });
  } catch (error) {
    console.error('Error en /api/series:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ANIME
// ==========================================
app.get('/api/anime', async (req, res) => {
  const page = req.query.page || 1;
  try {
    const data = await fetchTMDB('/discover/tv', {
      page,
      with_original_language: 'ja',
      sort_by: 'popularity.desc'
    });
    const animes = data.results.map(m => ({
      id: m.id,
      title: m.name,
      poster: m.poster_path
        ? `https://image.tmdb.org/t/p/w500${m.poster_path}`
        : 'https://via.placeholder.com/500x750?text=Sin-Imagen',
      overview: m.overview || 'Sin descripción disponible.',
      type: 'tv',
      year: (m.first_air_date || '').substring(0, 4),
      streamer: getStreamerUrl('tv', m.id)
    }));

    res.json({
      success: true,
      page: data.page,
      total_pages: data.total_pages,
      data: animes
    });
  } catch (error) {
    console.error('Error en /api/anime:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// SERVIR ARCHIVOS ESTÁTICOS DEL FRONTEND
// ==========================================
app.use(express.static(__dirname));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Escuchar puerto
app.listen(PORT, () => {
  console.log(`[OK] Servidor corriendo en puerto ${PORT}`);
});
