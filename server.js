const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Sirve tu PWA/index.html desde la raíz sin mover nada
app.use(express.static(__dirname));

// NUEVA RUTA OPTIMIZADA CON RESPALDO CONTRA BLOQUEOS
app.get('/api/peliculas', async (req, res) => {
  console.log("[Scraper] Buscando películas...");
  try {
    const response = await axios.get('https://api.themoviedb.org/3/movie/now_playing?api_key=ca83597e1b7d3a105f88fc90f5144947&language=es-MX', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000
    });
    
    const peliculas = response.data.results.map(p => ({
      id: p.id,
      titulo: p.title,
      sinopsis: p.overview,
      poster: `https://image.tmdb.org/t/p/w500${p.poster_path}`,
      fecha: p.release_date,
      streamUrl: `https://vidsrc.to/embed/movie/${p.id}`
    }));

    res.json({ success: true, data: peliculas });
  } catch (error) {
    console.log("[Scraper] Usando lista de respaldo estable por bloqueo...");
    const respaldo = [
      { id: 519182, titulo: "Mi Villano Favorito 4", sinopsis: "Gru y los minions regresan.", poster: "https://image.tmdb.org/t/p/w500/z9vTndE46O7662mRzC7L6M9m.jpg", streamUrl: "https://vidsrc.to/embed/movie/519182" },
      { id: 1022789, titulo: "IntensaMente 2", sinopsis: "Nuevas emociones en la cabeza de Riley.", poster: "https://image.tmdb.org/t/p/w500/pY96wBwX5pU9I7a77b7g97O9E.jpg", streamUrl: "https://vidsrc.to/embed/movie/1022789" }
    ];
    res.json({ success: true, data: respaldo });
  }
});

// Ruta comodín para que tu PWA cargue siempre correctamente
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`FlojerApp (Hub Multimedia) corriendo en el puerto ${PORT}`);
});
