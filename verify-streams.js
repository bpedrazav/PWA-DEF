// verify-streams.js
const https = require('https');
const http = require('http');

const API_BASE = 'https://flojerapp.onrender.com/api';
const CATEGORIES = ['peliculas', 'series', 'anime'];

// Telegram config
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Función para verificar si una URL responde
async function checkUrl(url, timeout = 5000) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    
    const req = client.get(url, { timeout }, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        resolve({ url, status: res.statusCode, ok: true });
      } else {
        resolve({ url, status: res.statusCode, ok: false });
      }
    });
    
    req.on('error', () => resolve({ url, status: 0, ok: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ url, status: 0, ok: false, reason: 'timeout' });
    });
  });
}

async function verifyCategory(category) {
  console.log(`\n🔍 Verificando ${category}...`);
  
  let allItems = [];
  let page = 1;
  let totalPages = 1;
  
  do {
    try {
      const res = await fetch(`${API_BASE}/${category}?page=${page}`);
      const data = await res.json();
      
      if (data.success && data.data) {
        allItems = allItems.concat(data.data);
        totalPages = data.total_pages || 1;
      }
    } catch (e) {
      console.error(`Error obteniendo página ${page}:`, e.message);
      break;
    }
    page++;
  } while (page <= totalPages);
  
  console.log(` Total items: ${allItems.length}`);
  
  const failed = [];
  const ok = [];
  
  for (const item of allItems) {
    if (!item.streamUrl) continue;
    
    const result = await checkUrl(item.streamUrl);
    
    if (result.ok) {
      ok.push(item);
      process.stdout.write('✅');
    } else {
      failed.push(item);
      process.stdout.write('❌');
    }
  }
  
  console.log(`\n\n Resultados para ${category}:`);
  console.log(`✅ Funcionan: ${ok.length}`);
  console.log(`❌ Fallaron: ${failed.length}`);
  
  return