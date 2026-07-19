const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Sirve tu PWA/index.html desde la raíz sin mover nada
app.use(express.static(__dirname));

// RUTA AUTOMATIZADA DE CATÁLOGO MASIVO
app.get('/api/peliculas', async (req, res) => {
  console.log("[Scraper Masivo] Iniciando recolección de catálogo completo...");
  try {
    let catalogoCompleto = [];
    // Traemos las primeras 8 páginas de TMDB (20 películas por página = 160 películas automáticas)
    // Puedes subir este número si tu frontend necesita más volumen de golpe
    const paginasAObtener = 8; 

    for (let i = 1; i <= paginasAObtener; i++) {
      const response = await axios.get(`https://api.themoviedb.org/3/discover/movie?api_key=ca83597e1b7d3a105f88fc90f5144947&language=es-MX&sort_by=popularity.desc&page=${i}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 5000
      });

      if (response.data && response.data.results) {
        const paginaMapeada = response.data.results.map(p => ({
          id: p.id,
          titulo: p.title,
          sinopsis: p.overview || "Sin sinopsis disponible.",
          poster: p.poster_path ? `https://image.tmdb.org/t/p/w500${p.poster_path}` : "https://via.placeholder.com/500x750?text=No+Image",
          fecha: p.release_date || "N/A",
          // Enlace automatizado de streaming usando el reproductor embed global por ID
          streamUrl: `https://vidsrc.to/embed/movie/${p.id}`
        }));
        
        catalogoCompleto = catalogoCompleto.concat(paginaMapeada);
      }
    }

    console.log(`[Scraper Masivo] Éxito. Enviando ${catalogoCompleto.length} películas al frontend.`);
    res.json({ success: true, total: catalogoCompleto.length, data: catalogoCompleto });

  } catch (error) {
    console.log("[Scraper] Error en bucle masivo, enviando respaldo estable...");
    // Respaldo de seguridad en JSON para que tu PWA nunca se quede vacía si la API externa falla
    const respaldo = [
      { id: 519182, titulo: "Mi Villano Favorito 4", sinopsis: "Gru y los minions regresan.", poster: "https://image.tmdb.org/t/p/w500/z9vTndE46O7662mRzC7L6M9m.jpg", streamUrl: "https://vidsrc.to/embed/movie/519182" },
      { id: 1022789, titulo: "IntensaMente 2", sinopsis: "Nuevas emociones en la cabeza de Riley.", poster: "https://image.tmdb.org/t/p/w500/pY96wBwX5pU9I7a77b7g97O9E.jpg", streamUrl: "https://vidsrc.to/embed/movie/1022789" }
    ];
    res.json({ success: true, total: respaldo.length, data: respaldo });
  }
});

// Ruta comodín para que tu PWA cargue siempre correctamente sin romper rutas de la SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`FlojerApp (Hub Multimedia) corriendo en el puerto ${PORT}`);
});
