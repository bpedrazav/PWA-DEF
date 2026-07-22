const express = require('express');
const axios = require('axios');
const path = require('path');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// ─── CLAVE API DE TMDB ──────────────────────────────────────────
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// ─── PROVEEDORES DE STREAMING CON PRIORIDAD ────────────────────
const STREAM_PROVIDERS = [
    {
        name: 'vidlink',
        url: (type, id, s, e) => `https://vidlink.pro/${type}/${id}${type === 'tv' ? `/${s}/${e}` : ''}`,
        hasSubtitles: true,
        priority: 1
    },
    {
        name: 'vidsrc.cc',
        url: (type, id, s, e) => `https://vidsrc.cc/v2/embed/${type}/${id}${type === 'tv' ? `/${s}/${e}` : ''}`,
        hasSubtitles: true,
        priority: 2
    },
    {
        name: 'vidsrc.vip',
        url: (type, id, s, e) => `https://vidsrc.vip/embed/${type}/${id}${type === 'tv' ? `/${s}/${e}` : ''}`,
        hasSubtitles: true,
        priority: 3
    },
    {
        name: 'embed.su',
        url: (type, id, s, e) => `https://embed.su/embed/${type}/${id}${type === 'tv' ? `/${s}/${e}` : ''}`,
        hasSubtitles: true,
        priority: 4
    },
    {
        name: 'vidsrc.net',
        url: (type, id, s, e) => `https://vidsrc.net/embed/${type}/${id}${type === 'tv' ? `/${s}/${e}` : ''}`,
        hasSubtitles: false,
        priority: 5
    },
    {
        name: 'multiembed',
        url: (type, id, s, e) => `https://multiembed.mov/?video_id=${id}${type === 'tv' ? `&s=${s}&e=${e}` : ''}`,
        hasSubtitles: true,
        priority: 6
    }
];

// ─── FUNCIÓN AUXILIAR PARA TMDB ────────────────────────────────
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

// ════════════════════════════════════════════════════════════════════
//  ENDPOINTS DE CATÁLOGO
// ════════════════════════════════════════════════════════════════════

// ─── OBTENER DETALLES DE SERIE (temporadas y episodios) ──────
app.get('/api/tv-details/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = await axios.get(`${TMDB_BASE_URL}/tv/${id}`, {
            params: {
                api_key: TMDB_API_KEY,
                language: 'es-MX'
            },
            timeout: 8000
        });

        const seasons = data.data.seasons || [];
        const seasonDetails = [];

        for (const season of seasons) {
            if (season.season_number === 0) continue;
            const epData = await axios.get(`${TMDB_BASE_URL}/tv/${id}/season/${season.season_number}`, {
                params: {
                    api_key: TMDB_API_KEY,
                    language: 'es-MX'
                },
                timeout: 8000
            });
            seasonDetails.push({
                season_number: season.season_number,
                episode_count: epData.data.episodes?.length || 0,
                episodes: epData.data.episodes?.map(e => ({
                    episode_number: e.episode_number,
                    name: e.name,
                    still_path: e.still_path ? `https://image.tmdb.org/t/p/w300${e.still_path}` : null
                })) || []
            });
        }

        res.json({
            success: true,
            name: data.data.name,
            seasons: seasonDetails,
            total_seasons: seasonDetails.length,
            total_episodes: seasonDetails.reduce((acc, s) => acc + s.episode_count, 0)
        });
    } catch (error) {
        console.error('Error en /api/tv-details:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── OBTENER URL DE STREAMING CON VERIFICACIÓN ─────────────────
app.get('/api/stream-url', async (req, res) => {
    const { type = 'movie', id, season = 1, episode = 1, provider_index = 0 } = req.query;

    if (!id) {
        return res.status(400).json({ success: false, message: 'ID es requerido' });
    }

    const providers = STREAM_PROVIDERS;
    const startIdx = parseInt(provider_index) || 0;

    for (let i = startIdx; i < providers.length; i++) {
        const p = providers[i];
        const url = p.url(type, id, season, episode);
        try {
            const response = await axios.head(url, {
                timeout: 3000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
                }
            });
            if (response.status === 200 || response.status === 302 || response.status === 301) {
                return res.json({
                    success: true,
                    provider: p.name,
                    url: url,
                    hasSubtitles: p.hasSubtitles,
                    providerIndex: i,
                    message: `Streaming via ${p.name}`
                });
            }
        } catch (e) {
            continue;
        }
    }

    res.json({
        success: true,
        provider: providers[0].name,
        url: providers[0].url(type, id, season, episode),
        hasSubtitles: providers[0].hasSubtitles,
        providerIndex: 0,
        message: 'Usando proveedor por defecto'
    });
});

// ─── PROXY PARA ELIMINAR ANUNCIOS Y POPUPS ─────────────────────
app.get('/api/clean-player', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ success: false, message: 'URL requerida' });
    }

    try {
        const response = await axios.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8'
            }
        });

        const $ = cheerio.load(response.data);

        // Eliminar scripts de anuncios
        const adScriptPatterns = ['ads', 'adserver', 'doubleclick', 'googlead', 'googletag', 'adservice', 'adnxs', 'taboola', 'outbrain', 'popup', 'popunder', 'adblock', 'advertisement', 'advert'];
        $('script').each((i, el) => {
            const src = $(el).attr('src') || '';
            const content = $(el).html() || '';
            const shouldRemove = adScriptPatterns.some(p => 
                src.toLowerCase().includes(p) || 
                content.toLowerCase().includes(p) ||
                content.includes('window.open') ||
                content.includes('alert(') ||
                content.includes('confirm(')
            );
            if (shouldRemove) {
                $(el).remove();
            }
        });

        // Eliminar iframes de anuncios
        $('iframe').each((i, el) => {
            const src = $(el).attr('src') || '';
            const adPatterns = ['ads', 'adserver', 'doubleclick', 'googlead', 'googletag', 'adnxs'];
            if (adPatterns.some(p => src.toLowerCase().includes(p))) {
                $(el).remove();
            }
        });

        // Eliminar divs de anuncios
        $('[class*="ad" i], [id*="ad" i]').each((i, el) => {
            const className = $(el).attr('class') || '';
            const id = $(el).attr('id') || '';
            const adPatterns = ['ad', 'ads', 'advertisement', 'advert', 'banner', 'promo'];
            if (adPatterns.some(p => className.toLowerCase().includes(p) || id.toLowerCase().includes(p))) {
                $(el).remove();
            }
        });

        // Eliminar enlaces de anuncios
        $('a[target="_blank"]').each((i, el) => {
            const href = $(el).attr('href') || '';
            if (href.includes('click') || href.includes('ad') || href.includes('go')) {
                $(el).remove();
            }
        });

        // Extraer el reproductor
        let playerContent = '';
        const playerSelectors = [
            'video', 
            '.video-container', 
            '.player-container', 
            '#player', 
            '.player', 
            '#video-container', 
            '.jwplayer', 
            '.video-js',
            'iframe[src*="player"]',
            'iframe[src*="embed"]',
            '#video-player',
            '.embed-container'
        ];
        
        playerSelectors.forEach(selector => {
            if (!playerContent) {
                $(selector).each((i, el) => {
                    playerContent += $.html(el);
                });
            }
        });

        if (!playerContent) {
            $('iframe, video').each((i, el) => {
                if (!playerContent) {
                    playerContent = $.html(el);
                }
            });
        }

        if (!playerContent) {
            playerContent = $('body').html();
        }

        const cleanHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        html, body { 
            width:100%; 
            height:100%; 
            overflow:hidden;
            background:#000; 
            display:flex; 
            align-items:center; 
            justify-content:center;
        }
        video, iframe { 
            width:100% !important; 
            height:100% !important; 
            max-width:100% !important;
            max-height:100vh !important;
            border:none !important; 
            background:#000; 
            display:block !important;
            object-fit:contain !important;
        }
        .video-container, .player-container, #player, .player, #video-container,
        .jwplayer, .video-js, .embed-container {
            width:100% !important; 
            height:100% !important; 
            max-height:100vh !important;
        }
        .jwplayer .jw-media, .video-js .vjs-tech,
        .jwplayer video, .video-js video {
            width:100% !important; 
            height:100% !important; 
            object-fit:contain !important;
        }
        .jwplayer .jw-embed { width:100% !important; height:100% !important; }
        .ad, .ads, .ad-container, .advertisement, .banner, .promo,
        [class*="ad" i], [id*="ad" i] { display:none !important; }
        .jwplayer .jw-title, .jwplayer .jw-controls, .jwplayer .jw-overlay { z-index:10; }
        .jwplayer { position:relative !important; }
        .jwplayer .jw-media { position:relative !important; }
        .jwplayer .jw-ads { display:none !important; }
        .jwplayer .jw-overlay { display:none !important; }
        ::-webkit-scrollbar { display:none; }
        .jwplayer .jw-controlbar { background:rgba(0,0,0,0.8) !important; }
        .jwplayer .jw-background-color { background:#000 !important; }
    </style>
</head>
<body>
    ${playerContent || '<div style="color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;font-size:16px;">Cargando reproductor...</div>'}
    <script>
        window.open = function() { return null; };
        document.addEventListener('click', function(e) {
            if (e.target.tagName === 'A' && e.target.target === '_blank') {
                e.preventDefault();
                return false;
            }
        });
        setTimeout(function() {
            const video = document.querySelector('video');
            if (video) {
                video.play().catch(function() {});
                video.setAttribute('playsinline', 'true');
                video.setAttribute('webkit-playsinline', 'true');
            }
            document.querySelectorAll('.jwplayer .jw-icon-playback, .jwplayer .jw-icon-display, .vjs-big-play-button, .play-button').forEach(function(btn) {
                btn.click();
            });
        }, 1000);
    </script>
</body>
</html>`;

        res.send(cleanHtml);
    } catch (error) {
        console.error('Error en /api/clean-player:', error.message);
        res.redirect(url);
    }
});

// ─── BÚSQUEDA GLOBAL ────────────────────────────────────────────
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
                            : 'https://via.placeholder.com/500x750?text=Sin+Imagen',
                        overview: m.overview || 'Sin descripción disponible.',
                        type: type,
                        year: (m.release_date || m.first_air_date || '').substring(0, 4),
                        streamer: STREAM_PROVIDERS[0].url(type, m.id, 1, 1)
                    };
                })
        });
    } catch (error) {
        console.error('Error en /api/search:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── PELÍCULAS ──────────────────────────────────────────────────
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
                : 'https://via.placeholder.com/500x750?text=Sin+Imagen',
            overview: m.overview || 'Sin descripción disponible.',
            type: 'movie',
            year: (m.release_date || '').substring(0, 4),
            streamer: STREAM_PROVIDERS[0].url('movie', m.id, 1, 1)
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

// ─── SERIES ─────────────────────────────────────────────────────
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
                : 'https://via.placeholder.com/500x750?text=Sin+Imagen',
            overview: m.overview || 'Sin descripción disponible.',
            type: 'tv',
            year: (m.first_air_date || '').substring(0, 4),
            streamer: STREAM_PROVIDERS[0].url('tv', m.id, 1, 1)
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

// ─── ANIME ──────────────────────────────────────────────────────
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
                : 'https://via.placeholder.com/500x750?text=Sin+Imagen',
            overview: m.overview || 'Sin descripción disponible.',
            type: 'tv',
            year: (m.first_air_date || '').substring(0, 4),
            streamer: STREAM_PROVIDERS[0].url('tv', m.id, 1, 1)
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

// ─── ESTADÍSTICAS DEL CATÁLOGO ────────────────────────────────
app.get('/api/stats', async (req, res) => {
    try {
        const [movies, series, anime] = await Promise.all([
            fetchTMDB('/discover/movie', { sort_by: 'popularity.desc' }),
            fetchTMDB('/discover/tv', { sort_by: 'popularity.desc' }),
            fetchTMDB('/discover/tv', { with_original_language: 'ja', sort_by: 'popularity.desc' })
        ]);

        res.json({
            success: true,
            movies: movies.total_results || 0,
            series: series.total_results || 0,
            anime: anime.total_results || 0,
            providers: STREAM_PROVIDERS.map(p => p.name),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error en /api/stats:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── SERVIR ARCHIVOS ESTÁTICOS ─────────────────────────────────
app.use(express.static(__dirname));

// ─── FALLBACK PARA SPA ─────────────────────────────────────────
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── INICIAR SERVIDOR ──────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`[OK] Servidor corriendo en puerto ${PORT}`);
    console.log(`[OK] Proveedores de streaming: ${STREAM_PROVIDERS.map(p => p.name).join(', ')}`);
    console.log(`[OK] Clean Player: activado (elimina anuncios y popups)`);
});
