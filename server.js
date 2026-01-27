const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
require('dotenv').config();

const ConversationManager = require('./services/conversationManager');
const SheetService = require('./services/sheetService');
const AppointmentStore = require('./services/appointmentStore');
const WhatsappService = require('./services/whatsappService');
const AuthService = require('./services/authService');
const IstomaService = require('./services/istomaService');

const app = express();
app.use(bodyParser.json());
app.use(session({
    secret: process.env.SESSION_SECRET || 'super-secret-dental-bot',
    resave: false,
    saveUninitialized: false
}));
app.use(express.static('public')); // Serve frontend (login + dashboard)

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// Simple auth middleware for protected APIs
function requireAuth(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    return res.status(401).json({ error: 'Neautorizat' });
}

// Auth routes
app.post('/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ error: 'Utilizator și parolă obligatorii' });
    }
    try {
        const user = await AuthService.validateUser(username, password);
        if (!user) {
            return res.status(401).json({ error: 'Utilizator sau parolă incorecte' });
        }
        req.session.user = { id: user.id, username: user.username, role: user.role };
        res.json({ ok: true, user: req.session.user });
    } catch (e) {
        console.error('Login error:', e.message);
        res.status(500).json({ error: 'Eroare la autentificare' });
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ ok: true });
    });
});

// API: Get Leads from Sheet (protected)
app.get('/api/leads', requireAuth, async (req, res) => {
    try {
        const leads = await SheetService.getLeads();
        res.json(leads);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Appointments dashboard (protected)
app.get('/api/appointments', requireAuth, (req, res) => {
    try {
        const items = AppointmentStore.getAll();
        res.json(items);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: create manual appointment from dashboard (protected)
app.post('/api/appointments', requireAuth, (req, res) => {
    try {
        const { patientName, patientPhone, date, time, notes, doctorId, cabinetId } = req.body || {};
        if (!patientName || !patientPhone || !date || !time) {
            return res.status(400).json({ error: 'Nume, telefon, dată și oră sunt obligatorii.' });
        }
        const record = AppointmentStore.add({
            source: 'manual',
            status: 'manual_created',
            patientName,
            patientPhone,
            date,
            time,
            notes,
            doctorId,
            cabinetId
        });
        res.status(201).json(record);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Send Template (protected)
app.post('/api/send', requireAuth, async (req, res) => {
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

    // 1) Trimitem mesajul WhatsApp
    const success = await WhatsappService.sendTemplate(phone, 'dental', 'ro', components);

    // 2) În paralel, încercăm să înregistrăm pacientul în Istoma (PacientAPI AdaugaPacient)
    if (phone && name) {
        try {
            const parts = name.split(' ');
            const nume = parts[0] || '';
            const prenume = parts.slice(1).join(' ') || '';
            await IstomaService.addPatient({
                nume,
                prenume,
                telefon: phone,
                email: ''
            });
        } catch (e) {
            console.error('Error adding patient to Istoma from Sheet lead:', e.message);
        }
    }

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

// Message Handler Endpoint (public, pentru webhook WhatsApp)
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

// Protect main dashboard: dacă nu e logat, redirect la login
app.get('/', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/login.html');
    }
    res.sendFile(require('path').join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
