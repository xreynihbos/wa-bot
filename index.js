const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

// Ganti dengan URL Cloudflare Worker Anda yang aktif
const CLOUDFLARE_WORKER_URL = "https://botwaxrey.csrynaldifusototo.workers.dev/";

const processedMessages = new Set();
let isBotReady = false;

async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const sock = makeWASocket({ auth: state, printQRInTerminal: true });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('Scan QR Code ini menggunakan WhatsApp di HP Anda:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus, mencoba menghubungkan ulang...', shouldReconnect);
            if (shouldReconnect) startWhatsApp();
        } else if (connection === 'open') {
            console.log('🤖 X-rey AI (Teks & Gambar) Berhasil Terhubung!');
            setTimeout(() => { isBotReady = true; }, 5000);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (!isBotReady) return;
        
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe || msg.key.remoteJid.includes('@g.us')) return;

        const messageId = msg.key.id;
        if (processedMessages.has(messageId)) return;
        processedMessages.add(messageId);

        const senderJid = msg.key.remoteJid;
        const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (!messageText) return;

        const messageTimestamp = msg.messageTimestamp * 1000;
        if ((Date.now() - messageTimestamp) > (10 * 60 * 1000)) return;

        console.log(`[Pesan Masuk dari ${senderJid}]: ${messageText}`);

        try {
            const response = await axios.post(CLOUDFLARE_WORKER_URL, { message: messageText });
            const result = response.data;

            if (result.type === "image" && result.imageBuffer) {
                const imageBuffer = Buffer.from(result.imageBuffer, 'base64');
                await sock.sendMessage(senderJid, { 
                    image: imageBuffer, 
                    caption: result.caption 
                });
                console.log(`[X-rey AI Mengirim Gambar Berhasil]`);
            } else {
                await sock.sendMessage(senderJid, { text: result.reply });
                console.log(`[X-rey AI Membalas]: ${result.reply}`);
            }

        } catch (error) {
            console.error('Gagal memproses pesan:', error.message);
        }
    });
}

startWhatsApp();
