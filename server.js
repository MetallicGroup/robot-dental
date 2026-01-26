const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

const ConversationManager = require('./services/conversationManager');

const app = express();
app.use(bodyParser.json());
app.use(express.static('public')); // Serve frontend

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// API: Get Leads from Sheet
const SheetService = require('./services/sheetService');
app.get('/api/leads', async (req, res) => {
    try {
        const leads = await SheetService.getLeads();
        res.json(leads);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Send Template
const WhatsappService = require('./services/whatsappService');
app.post('/api/send', async (req, res) => {
    const { name, phone } = req.body;

    // Template: "dental"
    // Variable {{1}}: name
    const components = [
        {
            type: 'body',
            parameters: [
                { type: 'text', text: name }
            ]
        }
    ];

    const success = await WhatsappService.sendTemplate(phone, 'dental', 'ro', components);
    res.json({ success });
});

// Verification Endpoint for WhatsApp Webhook
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400); // Bad Request if query params missing
    }
});

// Message Handler Endpoint
app.post('/webhook', async (req, res) => {
    const body = req.body;

    console.log('Received webhook:', JSON.stringify(body, null, 2));

    if (body.object) {
        if (
            body.entry &&
            body.entry[0].changes &&
            body.entry[0].changes[0].value.messages &&
            body.entry[0].changes[0].value.messages[0]
        ) {
            const messageObj = body.entry[0].changes[0].value.messages[0];
            const from = messageObj.from;

            // Async handling
            try {
                await ConversationManager.handleMessage(from, messageObj);
            } catch (err) {
                console.error('Error handling message:', err);
            }
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

app.get('/', (req, res) => {
    res.send('WhatsApp Dental Bot is running!');
});

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
