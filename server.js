const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// //////////////////////////////////////////////////////////////////
// API KEY - TMDB
// //////////////////////////////////////////////////////////////////
const API_KEY = 'ff822aef912d0a0aca2e8024982bb608';

// //////////////////////////////////////////////////////////////////
// 1. ENDPOINT DE PELÍCULAS MASIVAS (CON MULTI-SERVIDOR)
// //////////////////////////////////////////////////////////////////
app.get('/api/peliculas', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const search = req.query.search;

    console.log(`[Aviso] Solicitando página ${page} de películas... ${search ? 'Buscando: ' + search : ''}`);

    try {
        const tmdbUrl = search
            ? `https://api.themoviedb.org/3/search/movie?api_key=${API_KEY}&language=es-MX&query=${encodeURIComponent(search)}&page=${page}`
            : `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&language=es-MX&sort_by=popularity.desc&page=${page}`;

        const response = await axios.get(tmdbUrl, { timeout: 8000 });

        if (response.data && response.data.results) {
            const totalPages = response.data.total_pages || 1;

            const peliculas = response.data.results.map(m => {
                let m_id = m.id;
                return {
                    id: m_id,
                    title: m.title,
                    overview: m.overview || "Sin sinopsis disponible.",
                    poster_path: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : "https://via.placeholder.com/500x750?text=No+Image",
                    fecha: m.release_date || 'N/A',
                    streamsbUrl: `https://multiembed.mov/direct/movie.php?video_id=${m_id}`
                };
            });

            return res.json({ success: true, page: parseInt(page), total_pages: totalPages, data: peliculas });
        }

        throw new Error("Estructura inválida");

    } catch (error) {
        console.log('[Películas] Error:', error.message);
        res.json({ success: false, page: 1, total_pages: 1, data: [] });
    }
});

// //////////////////////////////////////////////////////////////////
// 2. ENDPOINT DE SERIES MASIVAS (CON MULTI-SERVIDOR)
// //////////////////////////////////////////////////////////////////
app.get('/api/series', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const search = req.query.search;

    console.log(`[Aviso] Solicitando página ${page} de series... ${search ? 'Buscando: ' + search : ''}`);

    try {
        // Si hay búsqueda usas la API de search/tv, si no usas discover/tv
        const tmdbUrl = search
            ? `https://api.themoviedb.org/3/search/tv?api_key=${API_KEY}&language=es-MX&query=${encodeURIComponent(search)}&page=${page}`
            : `https://api.themoviedb.org/3/discover/tv?api_key=${API_KEY}&language=es-MX&sort_by=popularity.desc&page=${page}`;

        const response = await axios.get(tmdbUrl, { timeout: 8000 });

        if (response.data && response.data.results) {
            const totalPages = response.data.total_pages || 1;

            const series = response.data.results.map(m => {
                let m_id = m.id;
                return {
                    id: m_id,
                    title: m.name,
                    overview: m.overview || "Sin sinopsis disponible.",
                    poster_path: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : "https://via.placeholder.com/500x750?text=No+Image",
                    fecha: m.first_air_date || 'N/A',
                    streamsbUrl: `https://multiembed.mov/direct/series.php?video_id=${m_id}`
                };
            });

            return res.json({ success: true, page: parseInt(page), total_pages: totalPages, data: series });
        }

        throw new Error("Estructura inválida");

    } catch (error) {
        console.log('[Series] Error:', error.message);
        res.json({ success: false, page: 1, total_pages: 1, data: [] });
    }
});

// //////////////////////////////////////////////////////////////////
// 3. ENDPOINT DE ANIMES MASIVAS (CON MULTI-SERVIDOR)
// //////////////////////////////////////////////////////////////////
app.get('/api/animes', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const search = req.query.search;

    console.log(`[Animes] Solicitando página ${page}... ${search ? 'Buscando: ' + search : ''}`);

    try {
        const tmdbUrl = search
            ? `https://api.themoviedb.org/3/search/tv?api_key=${API_KEY}&language=es-MX&query=${encodeURIComponent(search)}&page=${page}`
            : `https://api.themoviedb.org/3/discover/tv?api_key=${API_KEY}&language=es-MX&sort_by=popularity.desc&with_keywords=210024&with_origin_country=JP&page=${page}`;

        const response = await axios.get(tmdbUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 8000
        });

        if (response.data && response.data.results) {
            const totalPages = response.data.total_pages || 1;

            const animes = response.data.results.map(m => {
                let m_id = m.id;
                return {
                    id: m_id,
                    title: m.name,
                    overview: m.overview || "Sin sinopsis disponible.",
                    poster_path: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : "https://via.placeholder.com/500x750?text=No+Image",
                    fecha: m.first_air_date || 'N/A',
                    streamsbUrl: `https://multiembed.mov/direct/series.php?video_id=${m_id}`
                };
            });

            return res.json({ success: true, page: parseInt(page), total_pages: totalPages, data: animes });
        }

        throw new Error("Estructura inválida");

    } catch (error) {
        console.log('[Animes] Error:', error.message);
        res.json({ success: false, page: 1, total_pages: 1, data: [] });
    }
});

// //////////////////////////////////////////////////////////////////
// Ruta comodín para soportar el enrutamiento de la PWA
// //////////////////////////////////////////////////////////////////
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server [Hub Multimedia] corriendo en el puerto ${PORT}`);
});
