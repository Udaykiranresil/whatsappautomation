// Run with: npm run list-groups
// Uses the same saved session as server.js. Scan the QR once if prompted,
// then it prints every group chat's name and ID so you can fill in
// WHATSAPP_GROUP_ID in .env.
require('dotenv').config();
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', (qr) => {
  console.log('Scan this QR code with WhatsApp (Linked Devices):');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  const chats = await client.getChats();
  const groups = chats.filter(c => c.isGroup);

  if (groups.length === 0) {
    console.log('No group chats found on this WhatsApp account.');
  } else {
    console.log('\nYour WhatsApp groups:\n');
    groups.forEach(g => {
      console.log(`${g.name}\n  -> ${g.id._serialized}\n`);
    });
    console.log('Copy the ID for your target group into WHATSAPP_GROUP_ID in .env');
  }

  process.exit(0);
});

client.initialize();
