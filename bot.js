const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const https = require('https');

async function connectToWhatsApp () {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }) // Silencia logs innecesarios
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if(connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Bot desconectado. ¿Reconectar?', shouldReconnect);
            if(shouldReconnect) {
                connectToWhatsApp();
            }
        } else if(connection === 'open') {
            console.log('¡Bot de WhatsApp de FlojerApp conectado y listo!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

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

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return; // Puedes quitar msg.key.fromMe si quieres usar tu mismo chat
        
        const texto = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        if (texto === '!ping') {
            await sock.sendMessage(msg.key.remoteJid, { text: 'Pong! El bot está vivo.' });
        }
        
        if (texto === '!status') {
            await sock.sendMessage(msg.key.remoteJid, { text: '🔍 Verificando servidores de streaming...' });
            
            const vidsrc = await checkServer('https://vidsrc.to');
            const multiembed = await checkServer('https://multiembed.to');
            const theMovieDb = await checkServer('https://api.themoviedb.org');
            
            let reporte = `*REPORTE DE ESTADO FLOJERAPP*\n\n`;
            reporte += `🎬 *Servidor 1 (vidsrc):* ${vidsrc}\n`;
            reporte += `🍿 *Servidor 2 (multiembed):* ${multiembed}\n`;
            reporte += `🗄️ *Base de Datos (TMDb):* ${theMovieDb}\n\n`;
            reporte += `_Si un servidor de video está caído, los usuarios pueden cambiar al servidor secundario desde el reproductor._`;
            
            await sock.sendMessage(msg.key.remoteJid, { text: reporte });
        }
    });
}

connectToWhatsApp();
