const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// CONFIGURACIÓN CRÍTICA: Sirve la raíz del proyecto para no mover tus archivos
app.use(express.static(__dirname));

let canalesVerificadosCache = [
  { name: "Canal de Respaldo HLS", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" }
];

const FUENTES_IPTV = [
  "https://iptv-org.github.io/iptv/countries/cl.m3u", 
  "https://raw.githubusercontent.com/RamXenon/IPTV/main/Latino.m3u"
];

async function ejecutarScrapingIPTV() {
  console.log("[Scraper] Extrayendo listas M3U...");
  let candidatos = [];

  for (const url of FUENTES_IPTV) {
    try {
      const res = await axios.get(url, { timeout: 5000 });
      const lineas = res.data.split('\n');
      
      for (let i = 0; i < lineas.length; i++) {
        if (lineas[i].startsWith('#EXTINF:')) {
          const nombre = lineas[i].split(',').pop().trim();
          const streamUrl = lineas[i + 1] ? lineas[i + 1].trim() : '';
          if (streamUrl.startsWith('http')) {
            candidatos.push({ name: nombre, url: streamUrl });
          }
        }
      }
    } catch (err) {
      console.error(`[Scraper] No se pudo acceder a: ${url}`);
    }
  }

  candidatos = [...new Map(candidatos.map(item => [item.url, item])).values()].slice(0, 30);
  
  const validados = [];
  await Promise.all(candidatos.map(async (canal) => {
    try {
      const response = await axios.head(canal.url, { timeout: 2000 });
      if (response.status === 200) validados.push(canal);
    } catch (e) {}
  }));

  if (validados.length > 0) {
    canalesVerificadosCache = validados;
    console.log(`[Scraper] Sincronización completada. ${validados.length} canales operativos.`);
  }
}

// Ejecutar scraper automático cada 6 horas
ejecutarScrapingIPTV();
setInterval(ejecutarScrapingIPTV, 6 * 60 * 60 * 1000);

// Rutas de API para FlojerApp por si las necesitas
app.get('/api/iptv', (req, res) => {
  res.json(canalesVerificadosCache);
});

// Cualquier otra ruta que no sea un archivo estático cargará tu index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`FlojerApp corriendo en el puerto ${PORT}`);
});
