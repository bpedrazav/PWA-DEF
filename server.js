const express = require('express');
const path = require('path');
const axios = require('axios');

// Middleware CORS manual para evitar dependencias externas si fallan
const corsMiddleware = (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
};

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración básica
app.use(corsMiddleware);
app.use(express.json());
app.use(express.static(path.join(__dirname))); // Sirve index.html y assets

// TU API KEY DE TMDB
const API_KEY = 'f745ccfefed83ac1edca42526a0888'; 

// --- ENDPOINT UNIFICADO CON BÚSQUEDA REAL ---
app.get('/api/entretenimiento', async (req, res) => {
    const page = req.query.page || 1;
    const search = req.query.search || '';
    const type = req.query.type || 'peliculas'; // peliculas, series, anime

    try {
        let url = '';
        
        // Lógica de ruteo a TMDB
        if (search) {
            // MODO BÚSQUEDA
            if (type === 'anime') {
                url = `https://api.themoviedb.org/3/search/tv?api_key=${API_KEY}&language=es-MX&query=${encodeURIComponent(search)}&with_keywords=210024&with_origin_country=JP&page=${page}`;
            } else if (type === 'series') {
                url = `https://api.themoviedb.org/3/search/tv?api_key=${API_KEY}&language=es-MX&query=${encodeURIComponent(search)}&page=${page}`;
            } else {
                url = `https://api.themoviedb.org/3/search/movie?api_key=${API_KEY}&language=es-MX&query=${encodeURIComponent(search)}&page=${page}`;
            }
        } else {
            // MODO DESCUBRIMIENTO (Catálogo normal)
            if (type === 'anime') {
                url = `https://api.themoviedb.org/3/discover/tv?api_key=${API_KEY}&language=es-MX&sort_by=popularity.desc&with_keywords=210024&with_origin_country=JP&page=${page}`;
            } else if (type === 'series') {
                url = `https://api.themoviedb.org/3/discover/tv?api_key=${API_KEY}&language=es-MX&sort_by=popularity.desc&page=${page}`;
            } else {
                url = `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&language=es-MX&sort_by=popularity.desc&page=${page}`;
            }
        }

        const response = await axios.get(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0' }, 
            timeout: 8000 
        });

        if (!response.data || !response.data.results) {
            return res.json({ success: true, page: 1, total_pages: 1, data: [] });
        }

        // Normalizar datos para el frontend
        const isMovie = type === 'peliculas';
        const data = response.data.results.map(item => ({
            id: item.id,
            titulo: isMovie ? item.title : item.name,
            sinopsis: item.overview || "Sin sinopsis disponible.",
            poster: item.poster_path 
                ? `https://image.tmdb.org/t/p/w500${item.poster_path}` 
                : "https://via.placeholder.com/500x750?text=No+Image",
            fecha: isMovie ? (item.release_date || "N/A") : (item.first_air_date || "N/A"),
            streamUrl: isMovie 
                ? `https://vidsrc.to/embed/movie/${item.id}` 
                : `https://vidsrc.to/embed/tv/${item.id}/1/1`,
            streamBackup: isMovie
                ? `https://multiembed.mov/direct/movie.php?video_id=${item.id}`
                : `https://multiembed.mov/direct/series.php?video_id=${item.id}&s=1&e=1`
        }));

        res.json({
            success: true,
            page: parseInt(page),
            total_pages: response.data.total_pages || 1,
            data: data
        });

    } catch (error) {
        console.error('[API Error]:', error.message);
        res.status(500).json({ success: false, data: [], error: error.message });
    }
});

// Servir Frontend (Catch-all)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 FlojerApp Backend corriendo en puerto ${PORT}`);
});
