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
    const options = {
      timeout,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    };
    
    const req = client.get(url, options, (res) => {
      // 403 Forbidden is often Cloudflare protecting a live server (vidsrc/multiembed).
      // We consider it "working" because the server is actively responding.
      if ((res.statusCode >= 200 && res.statusCode < 400) || res.statusCode === 403) {
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
  
  return { ok, failed };
}

// Enviar mensaje a Telegram
async function sendTelegramMessage(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('⚠️  Telegram no configurado (sin TOKEN o CHAT_ID)');
    return;
  }
  
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML'
      })
    });
    
    const data = await res.json();
    if (data.ok) {
      console.log('📱 Mensaje enviado a Telegram');
    } else {
      console.error('Error enviando a Telegram:', data);
    }
  } catch (e) {
    console.error('Error en Telegram:', e.message);
  }
}

// Formatear mensaje para Telegram
function formatTelegramMessage(results) {
  let message = '<b>🎬 Reporte de Streams - FlojerApp</b>\n\n';
  
  let totalOk = 0;
  let totalFailed = 0;
  const failedItems = [];
  
  for (const [category, res] of Object.entries(results)) {
    const emoji = category === 'peliculas' ? '🎥' : category === 'series' ? '' : '🎌';
    message += `${emoji} <b>${category.toUpperCase()}</b>\n`;
    message += `   ✅ Funcionan: ${res.ok.length}\n`;
    message += `   ❌ Fallaron: ${res.failed.length}\n\n`;
    
    totalOk += res.ok.length;
    totalFailed += res.failed.length;
    
    if (res.failed.length > 0) {
      res.failed.forEach(item => {
        failedItems.push(`${category}: ${item.titulo}`);
      });
    }
  }
  
  message += `<b> Total:</b>\n`;
  message += `   ✅ ${totalOk} |  ${totalFailed}\n`;
  
  if (totalFailed > 0) {
    message += `\n<b>⚠️  Streams caídos:</b>\n`;
    failedItems.slice(0, 10).forEach(item => {
      message += `   • ${item}\n`;
    });
    
    if (failedItems.length > 10) {
      message += `   ... y ${failedItems.length - 10} más\n`;
    }
  } else {
    message += `\n<b>🎉 ¡Todo funciona perfecto!</b>`;
  }
  
  message += `\n\n<i>Generado: ${new Date().toLocaleString('es-ES')}</i>`;
  
  return message;
}

async function main() {
  console.log('🚀 Iniciando verificación de streams...\n');
  
  const results = {};
  
  for (const category of CATEGORIES) {
    results[category] = await verifyCategory(category);
  }
  
  // Enviar a Telegram
  const message = formatTelegramMessage(results);
  await sendTelegramMessage(message);
  
  // Guardar reporte en archivo
  const fs = require('fs');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(`reporte-streams-${timestamp}.json`, JSON.stringify(results, null, 2));
  
  console.log('\n📈 RESUMEN FINAL:');
  for (const [cat, res] of Object.entries(results)) {
    console.log(`${cat}: ✅ ${res.ok.length} | ❌ ${res.failed.length}`);
  }
}

main().catch(console.error);