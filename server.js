const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Clave API de TMDB (Si no usas variables de entorno, ponla aquí entre comillas)
const TMDB_API_KEY = process.env.TMDB_API_KEY || 'f745ccfefedb83e1edca042526da0868'; 
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Servidores de streaming disponibles
const PROVIDERS = [
    (type, id) => `https://vidsrc.to/embed/${type}/${id}`, // Principal
    (type, id) => `https://multiembed.to/embed/tmdb/${type}/${id}` // Backup
];

const getStreamerUrl = (type, id, index = 0) => {
    return PROVIDERS[index] ? PROVIDERS[index](type, id) : PROVIDERS[0](type, id);
};

// Función auxiliar para peticiones a TMDB
const fetchTMDB = async (url, params = {}) => {
    const res = await axios.get(`${TMDB_BASE_URL}${url}`, {
        params: { api_key: TMDB_API_KEY, language: 'es-MX', ...params },
        timeout: 8000
    });
    return res.data;
};

// --- ENDPOINTS DE LA API ---

// 1. Búsqueda Global (La Lupita)
app.get('/api/search', async (req, res) => {
    const { query, page = 1 } = req.query;
    if (!query) return res.status(400).json({ success: false, message: 'Falta query' });
    
    try {
        const data = await fetchTMDB('/search/multi', { query, page });
        const items = data.results.filter(m => m.media_type === 'movie' || m.media_type === 'tv')
            .map(m => ({
                id: m.id,
                title: m.title || m.name,
                poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Image',
                type: m.media_type,
                year: (m.release_date || m.first_air_date || '').substring(0, 4)
            }));
        res.json({ success: true, data: items, total_pages: data.total_pages });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. Películas
app.get('/api/peliculas', async (req, res) => {
    try {
        const data = await fetchTMDB('/discover/movie', { page: req.query.page || 1, sort_by: 'popularity.desc' });
        const results = data.results.map(m => ({
            id: m.id, title: m.title, 
            poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Image',
            type: 'movie', streamer: getStreamerUrl('movie', m.id)
        }));
        res.json({ success: true, data: results, total_pages: data.total_pages });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// 3. Series
app.get('/api/series', async (req, res) => {
    try {
        const data = await fetchTMDB('/discover/tv', { page: req.query.page || 1, sort_by: 'popularity.desc' });
        const results = data.results.map(m => ({
            id: m.id, title: m.name, 
            poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Image',
            type: 'tv', streamer: getStreamerUrl('tv', m.id)
        }));
        res.json({ success: true, data: results, total_pages: data.total_pages });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// 4. Anime
app.get('/api/anime', async (req, res) => {
    try {
        const data = await fetchTMDB('/discover/tv', { page: req.query.page || 1, with_genres: 16, with_origin_country: 'JP' });
        const results = data.results.map(m => ({
            id: m.id, title: m.name, 
            poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Image',
            type: 'tv', streamer: getStreamerUrl('tv', m.id)
        }));
        res.json({ success: true, data: results, total_pages: data.total_pages });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// --- CONFIGURACIÓN PWA Y ESTÁTICOS ---
app.use(express.static(__dirname));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`FlojerApp corriendo en puerto ${PORT}`);
});
