const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Sirve tu PWA/index.html desde la raíz sin mover nada
app.use(express.static(__dirname));

// RUTA AUTOMATIZADA DE CATÁLOGO MASIVO INTELIGENTE
app.get('/api/peliculas', async (req, res) => {
  // Permite al frontend pedir la página que quiera (ej: /api/peliculas?page=1)
  // Por defecto, si no se pasa el parámetro, carga la página 1
  const page = req.query.page || 1;
  console.log(`[Scraper] Solicitando página ${page} del catálogo masivo...`);
  
  try {
    // Hacemos una sola petición por llamado para evitar bloqueos por ráfagas en Render
    const response = await axios.get(`https://api.themoviedb.org/3/discover/movie?api_key=ca83597e1b7d3a105f88fc90f5144947&language=es-MX&sort_by=popularity.desc&page=${page}`, {
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
        // Enlace automático de streaming usando el reproductor embed por ID de película
        streamUrl: `https://vidsrc.to/embed/movie/${p.id}`
      }));

      console.log(`[Scraper] Éxito. Enviadas ${peliculas.length} películas de la página ${page}. Total de páginas disponibles: ${response.data.total_pages}`);
      
      return res.json({ 
        success: true, 
        page: parseInt(page),
        total_pages: response.data.total_pages,
        total_results: response.data.total_results,
        data: peliculas 
      });
    }

    throw new Error("Estructura de respuesta no válida");

  } catch (error) {
    console.log(`[Scraper] Error al obtener catálogo (Página ${page}):`, error.message);
    // Respaldo de seguridad en JSON para evitar que la PWA tire error 500
    const respaldo = [
      { id: 519182, titulo: "Mi Villano Favorito 4", sinopsis: "Gru y los minions regresan.", poster: "https://image.tmdb.org/t/p/w500/z9vTndE46O7662mRzC7L6M9m.jpg", streamUrl: "https://vidsrc.to/embed/movie/519182" },
      { id: 1022789, titulo: "IntensaMente 2", sinopsis: "Nuevas emociones en la cabeza de Riley.", poster: "https://image.tmdb.org/t/p/w500/pY96wBwX5pU9I7a77b7g97O9E.jpg", streamUrl: "https://vidsrc.to/embed/movie/1022789" }
    ];
    res.json({ success: true, page: 1, total_pages: 1, data: respaldo });
  }
});

// Ruta comodín para que tu PWA cargue siempre correctamente sin romper rutas de la SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`FlojerApp (Hub Multimedia) corriendo en el puerto ${PORT}`);
});
