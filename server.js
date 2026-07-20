const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Clave API de TMDB
const TMDB_API_KEY = 'f1b3ccfede5e8e90bd4e3d30e0108990';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Helper para llamadas a TMDB
const fetchTMDB = async (url, params = {}) => {
    const res = await axios.get(`${TMDB_BASE_URL}${url}`, {
        params: { api_key: TMDB_API_KEY, language: 'es-ES', ...params },
        timeout: 8000
    });
    return res.data;
};

// ==========================================
// ENDPOINT DE BÚSQUEDA GLOBAL (LUPA)
// ==========================================
app.get('/api/search', async (req, res) => {
    const { query, page = 1 } = req.query;
    if (!query) return res.json({ results: [], page: 1, total_pages: 1 });

    try {
        const data = await fetchTMDB('/search/multi', { query, page });
        
        // Filtramos para devolver solo contenido multimedia válido (películas y series)
        const items = (data.results || [])
            .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
            .map(item => ({
                id: item.id,
                title: item.title || item.name,
                type: item.media_type === 'movie' ? 'movie' : 'tv',
                poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Image',
                synopsis: item.overview || 'Sin descripción disponible.',
                year: (item.release_date || item.first_air_date || '').substring(0, 4)
            }));

        res.json({ success: true, page: data.page, total_pages: data.total_pages, data: items });
    } catch (error) {
        console.error('Error en /api/search:', error.message);
        res.status(500).json({ success: false, error: error.message, data: [] });
    }
});

// ==========================================
// ENDPOINTS POR CATEGORÍA
// ==========================================

// 1. PELÍCULAS
app.get('/api/peliculas', async (req, res) => {
    const page = req.query.page || 1;
    try {
        const data = await fetchTMDB('/discover/movie', { page, sort_by: 'popularity.desc' });
        const peliculas = (data.results || []).map(p => ({
            id: p.id,
            title: p.title,
            type: 'movie',
            poster: p.poster_path ? `https://image.tmdb.org/t/p/w500${p.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Image',
            synopsis: p.overview || 'Sin descripción disponible.',
            streamUrl: `https://vidsrc.me/embed/movie?tmdb=${p.id}`
        }));
        res.json({ success: true, page: data.page, total_pages: data.total_pages, data: peliculas });
    } catch (error) {
        res.json({ success: false, page: 1, total_pages: 1, data: [] });
    }
});

// 2. SERIES
app.get('/api/series', async (req, res) => {
    const page = req.query.page || 1;
    try {
        const data = await fetchTMDB('/discover/tv', { page, sort_by: 'popularity.desc' });
        const series = (data.results || []).map(s => ({
            id: s.id,
            title: s.name,
            type: 'tv',
            poster: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Image',
            synopsis: s.overview || 'Sin descripción disponible.',
            streamUrl: `https://multiembed.mov/directtv/?video_id=${s.id}&tmdb=1`
        }));
        res.json({ success: true, page: data.page, total_pages: data.total_pages, data: series });
    } catch (error) {
        res.json({ success: false, page: 1, total_pages: 1, data: [] });
    }
});

// 3. ANIME
app.get('/api/anime', async (req, res) => {
    const page = req.query.page || 1;
    try {
        const data = await fetchTMDB('/discover/tv', { 
            page, 
            with_genres: '16', 
            with_origin_country: 'JP', 
            sort_by: 'popularity.desc' 
        });
        const animes = (data.results || []).map(a => ({
            id: a.id,
            title: a.name,
            type: 'tv',
            poster: a.poster_path ? `https://image.tmdb.org/t/p/w500${a.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Image',
            synopsis: a.overview || 'Sin descripción disponible.',
            streamUrl: `https://multiembed.mov/directtv/?video_id=${a.id}&tmdb=1`
        }));
        res.json({ success: true, page: data.page, total_pages: data.total_pages, data: animes });
    } catch (error) {
        res.json({ success: false, page: 1, total_pages: 1, data: [] });
    }
});

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname)));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`[OK] Servidor corriendo en puerto ${PORT}`);
});
