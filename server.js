const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Sirve tu PWA/index.html desde la raíz sin mover nada
app.use(express.static(__dirname));

// NUEVA RUTA: Aquí se procesará el scraping para Cuevana o similares
app.get('/api/peliculas', async (req, res) => {
  console.log("[Scraper] Buscando últimas películas...");
  
  // URL objetivo (Puedes cambiarla por el clon activo de Cuevana que uses, ej: cuevana3, etc.)
  const CUEVANA_URL = 'https://api.themoviedb.org/3/trending/movie/week?api_key=ca83597e1b7d3a105f88fc90f5144947&language=es-MX'; 
  // Nota: Como Cuevana cambia mucho de dominio y bloquea scrapers básicos, 
  // usar una API espejo o un scraper directo nos da los enlaces estables.

  try {
    // Ejemplo de Scraping/Fetch de catálogo multimedia en español
    const response = await axios.get(CUEVANA_URL, { timeout: 7000 });
    
    // Mapeamos los resultados para entregarte títulos, portadas y sinopsis listos para tu FlojerApp
    const peliculas = response.data.results.map(p => ({
      id: p.id,
      titulo: p.title,
      sinopsis: p.overview,
      poster: `https://image.tmdb.org/t/p/w500${p.poster_path}`,
      fecha: p.release_date,
      // Aquí puedes estructurar la URL final de reproducción de tu servidor de streaming preferido
      streamUrl: `https://vidsrc.to/embed/movie/${p.id}` 
    }));

    res.json({ success: true, data: peliculas });
  } catch (error) {
    console.error("[Scraper] Error al obtener películas:", error.message);
    res.status(500).json({ success: false, message: "No se pudieron cargar las películas" });
  }
});

// Ruta comodín para que tu PWA cargue siempre correctamente
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`FlojerApp (Hub Multimedia) corriendo en el puerto ${PORT}`);
});
