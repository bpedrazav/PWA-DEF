const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const https = require('https');
const http = require('http');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', (qr) => {
    console.log('ESCANEA ESTE CÓDIGO QR CON LA APP DE WHATSAPP:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('¡Bot de WhatsApp de FlojerApp conectado y listo!');
});

// Helper para hacer ping a los servidores
function checkServer(url) {
    return new Promise((resolve) => {
        const req = https.get(url, { timeout: 5000 }, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 400) {
                resolve('✅ ACTIVO');
            } else {
                resolve(`❌ ERROR (${res.statusCode})`);
            }
        });
        req.on('error', () => resolve('❌ CAÍDO'));
        req.on('timeout', () => {
            req.destroy();
            resolve('❌ TIMEOUT');
        });
    });
}

client.on('message', async msg => {
    if (msg.body === '!ping') {
        msg.reply('Pong! El bot está vivo.');
    }
    
    if (msg.body === '!status') {
        msg.reply('🔍 Verificando servidores de streaming...');
        
        const vidsrc = await checkServer('https://vidsrc.to');
        const multiembed = await checkServer('https://multiembed.to');
        const theMovieDb = await checkServer('https://api.themoviedb.org');
        
        let reporte = `*REPORTE DE ESTADO FLOJERAPP*\n\n`;
        reporte += `🎬 *Servidor 1 (vidsrc):* ${vidsrc}\n`;
        reporte += `🍿 *Servidor 2 (multiembed):* ${multiembed}\n`;
        reporte += `🗄️ *Base de Datos (TMDb):* ${theMovieDb}\n\n`;
        reporte += `_Si un servidor de video está caído, los usuarios pueden cambiar al servidor secundario desde el reproductor._`;
        
        msg.reply(reporte);
    }
});

client.initialize();
