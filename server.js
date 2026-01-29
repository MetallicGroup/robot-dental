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
const EmailService = require('./services/emailService');

// Helper maps for doctor names and clinic addresses (adjust strings if needed)
const DOCTOR_NAMES = {
    2: 'Dr. PAVEL Iulia',
    3: 'Dr. UDECI Madalina',
    4: 'Dr. COROIAN Andrei',
    5: 'Dr. CRETIU Raul'
};

// IdLocatie -> { name, address }
// TODO: actualizează adresele exacte ale sediilor după nevoie
const LOCATION_INFO = {
    5: {
        name: 'SUPERSMILE SIBIU',
        address: ' Str. Octav Doicescu (completează adresa exactă aici)'
    },
    11: {
        name: 'SUPERSMILE - ARHITECTILOR',
        address: 'Str. Doamna Stanca (completează adresa exactă aici)'
    }
};

function getDoctorName(id) {
    const numericId = Number(id);
    return DOCTOR_NAMES[numericId] || `Doctor ${numericId || ''}`.trim();
}

function getLocationInfo(id) {
    const numericId = Number(id);
    return LOCATION_INFO[numericId] || { name: 'Clinica Supersmile', address: '' };
}

function parseRoDateTime(dateStr, timeStr) {
    // dateStr: "DD.MM.YYYY", timeStr: "HH:MM"
    if (!dateStr || !timeStr) return null;
    const [day, month, year] = dateStr.split('.');
    const [hh, mm] = timeStr.split(':');
    if (!day || !month || !year || !hh || !mm) return null;
    // Use local time; Istoma times are local
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hh), Number(mm), 0, 0);
}

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
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

// Public API simplu pentru website: cele mai recente programări (WhatsApp + Autocall)
// GET /api/public/appointments
app.get('/api/public/appointments', (req, res) => {
    try {
        const items = AppointmentStore.getAll().slice(0, 20); // ultimele 20
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

// Webhook endpoint pentru Autocalls.ai -> programează direct în iStoma și trimite confirmare pe WhatsApp
// Așteptăm un payload de forma:
// {
//   phone: "40733342513",
//   name: "Prenume Nume",
//   date: "28.01.2026",        // sau ISO, dar recomand DD.MM.YYYY ca în Istoma
//   time: "15:00",
//   doctorId: 3,               // optional; dacă lipsește, putem pune un fallback
//   locationId: 5              // optional; dacă lipsește, folosim fallback sau 0
// }
// GET simplu pentru test ("Make test request" din Autocalls) – doar verifică că endpointul există
app.get('/api/autocall/book', (req, res) => {
    res.json({ ok: true, message: 'Autocall webhook endpoint is reachable. Use POST with JSON body for real bookings.' });
});

// Custom mid-call tool endpoint: întoarce disponibilitatea pe medici/cabinete pentru o anumită zi
// GET /api/autocall/slots?date=28.01.2026
app.get('/api/autocall/slots', async (req, res) => {
    const { date, locationId } = req.query || {};

    if (!date) {
        return res.status(400).json({ error: 'date (DD.MM.YYYY) este obligatoriu' });
    }

    try {
        // Dacă avem locationId, filtrăm doar pe acel sediu, altfel lăsăm 0 (toate sediile)
        const locationIds = locationId ? [Number(locationId)] : [];
        const doctorIds = []; // gol = toți medicii

        const slots = await IstomaService.getAvailableSlots(date, doctorIds, locationIds);

        if (!slots || slots.length === 0) {
            return res.json({
                date,
                doctors: [],
                message: `Nu am găsit niciun interval disponibil în Istoma pentru data de ${date}.`
            });
        }

        // Grupăm sloturile pe doctor și locație
        const doctorMap = {};

        for (const slot of slots) {
            const docId = Number(slot.IdMedic || slot.idMedic || slot.IDMedic);
            const locId = Number(slot.IdLocatie || slot.idLocatie || slot.IDLocatie);
            const startStr =
                slot.DataInceputInterval ||
                slot.dataInceputInterval ||
                slot.StartDate ||
                slot.dataInceput;

            if (!docId || !startStr) continue;

            // Extragem ora HH:MM
            let time = '';
            if (startStr.includes('T')) {
                time = startStr.split('T')[1].substring(0, 5);
            } else if (startStr.includes(' ')) {
                time = startStr.split(' ')[1].substring(0, 5);
            }
            if (!time) continue;

            if (!doctorMap[docId]) {
                doctorMap[docId] = {};
            }
            if (!doctorMap[docId][locId]) {
                doctorMap[docId][locId] = new Set();
            }
            doctorMap[docId][locId].add(time);
        }

        const doctors = Object.entries(doctorMap).map(([docIdStr, locs]) => {
            const docId = Number(docIdStr);
            const doctorName = getDoctorName(docId);

            const locations = Object.entries(locs).map(([locIdStr, timesSet]) => {
                const locId = Number(locIdStr);
                const locInfo = getLocationInfo(locId);
                const times = Array.from(timesSet).sort();

                return {
                    locationId: locId,
                    locationName: locInfo.name,
                    address: locInfo.address,
                    times
                };
            });

            return {
                doctorId: docId,
                doctorName,
                locations
            };
        });

        return res.json({
            date,
            doctors
        });
    } catch (err) {
        console.error('[AUTOCALL] Error in /api/autocall/slots:', err);
        return res.status(500).json({ error: 'Eroare la citirea programului din Istoma.' });
    }
});

app.post('/api/autocall/book', async (req, res) => {
    try {
        // Logăm tot ce vine de la Autocalls ca să vedem structura payload-ului real
        console.log('[AUTOCALL] Incoming webhook:', {
            method: req.method,
            headers: req.headers,
            body: req.body,
            query: req.query
        });

        const rawBody = req.body || {};
        const rawQuery = req.query || {};

        // Încearcă să găsești câmpurile în mai multe locuri posibile (body direct, query, sau sub-chei)
        const vars =
            rawBody.post_call ||
            rawBody.variables ||
            rawBody.data ||
            rawBody.extracted_variables || // Autocalls folosește "extracted_variables"
            rawBody;

        const phone =
            rawBody.phone ||
            rawQuery.phone ||
            rawBody.customer_phone ||
            rawBody.lead?.phone_number ||
            rawBody.lead?.phone ||
            vars?.phone ||
            vars?.customer_phone;

        const name =
            rawBody.name ||
            rawBody.lead?.name ||
            rawBody.customer_name ||
            vars?.customer_name ||
            'Client Autocall';

        const date =
            rawBody.date ||
            rawQuery.date ||
            rawBody.extracted_variables?.booking_date ||
            vars?.booking_date ||
            vars?.date ||
            rawBody.booking_date;

        const time =
            rawBody.time ||
            rawQuery.time ||
            rawBody.extracted_variables?.booking_time ||
            vars?.booking_time ||
            vars?.time ||
            rawBody.booking_time;

        const doctorIdRaw =
            rawBody.doctorId ||
            rawBody.doctor_id ||
            vars?.doctorId ||
            vars?.doctor_id;

        const locationIdRaw =
            rawBody.locationId ||
            rawBody.location_id ||
            vars?.locationId ||
            vars?.location_id;

        if (!phone || !date || !time) {
            // Pentru testele de tip "Make test request" din Autocalls, nu avem încă payload complet.
            // Răspundem cu 200 ca să nu fie marcat webhook-ul ca "failed".
            return res.status(200).json({
                ok: false,
                error: 'phone, date și time sunt obligatorii pentru booking real. Endpoint-ul funcționează, dar payload-ul este incomplet.'
            });
        }

        // Normalizează telefonul la format 407xxxxxxxx
        const normalizedPhone = SheetService.normalizePhone
            ? SheetService.normalizePhone(phone)
            : phone;

        const fullName = (name || 'Client Autocall').trim();
        const parts = fullName.split(' ');
        const nume = parts[0] || 'Client';
        const prenume = parts.slice(1).join(' ') || 'Autocall';

        const patientPayload = {
            nume,
            prenume,
            telefon: normalizedPhone,
            email: ''
        };

        // 1) Încearcă să citești programul real din Istoma și să găsești sloturi care acoperă ora cerută
        const requestedDateTime = parseRoDateTime(date, time);
        let effectiveDoctorId = null;
        let effectiveLocationId = null;

        if (requestedDateTime) {
            try {
                // Dacă avem deja un locationId din Autocalls, îl folosim; altfel lăsăm Istoma să aleagă toate sediile (0)
                const locationIdsToCheck = locationIdRaw ? [Number(locationIdRaw)] : [];
                const doctorIdsToCheck = doctorIdRaw ? [Number(doctorIdRaw)] : [];

                const slots = await IstomaService.getAvailableSlots(
                    date,
                    doctorIdsToCheck,
                    locationIdsToCheck
                );

                console.log('[AUTOCALL] Istoma slots fetched for date', date, 'count:', slots.length);

                // Filtrăm sloturile care acoperă exact ora cerută
                const matchingSlots = [];
                for (const slot of slots) {
                    const startStr = slot.DataInceputInterval || slot.dataInceputInterval || slot.StartDate;
                    const endStr = slot.DataFinalInterval || slot.dataFinalInterval || slot.EndDate;
                    if (!startStr || !endStr) continue;

                    const start = new Date(startStr);
                    const end = new Date(endStr);
                    if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;

                    if (requestedDateTime >= start && requestedDateTime < end) {
                        matchingSlots.push(slot);
                    }
                }

                console.log('[AUTOCALL] Matching slots for requested time:', matchingSlots.length);

                if (matchingSlots.length > 0) {
                    // Round-robin simplu / random printre medicii disponibili în aceste sloturi
                    const doctorSet = new Set(
                        matchingSlots
                            .map(s => s.IdMedic || s.idMedic)
                            .filter(Boolean)
                    );
                    const availableDoctors = Array.from(doctorSet);
                    if (availableDoctors.length > 0) {
                        const chosenDoctor =
                            availableDoctors[Math.floor(Math.random() * availableDoctors.length)];
                        const chosenSlot =
                            matchingSlots.find(
                                s => (s.IdMedic || s.idMedic) === chosenDoctor
                            ) || matchingSlots[0];

                        effectiveDoctorId = Number(chosenDoctor);
                        effectiveLocationId =
                            Number(chosenSlot.IdLocatie || chosenSlot.idLocatie) || null;

                        console.log('[AUTOCALL] Chosen doctor/location from slots:', {
                            effectiveDoctorId,
                            effectiveLocationId
                        });
                    }
                }
            } catch (e) {
                console.error('[AUTOCALL] Error while fetching/matching Istoma slots:', e);
            }
        }

        // 2) Dacă nu am găsit sloturi potrivite, folosim fallback: doctor random din pool și locație principală
        if (!effectiveDoctorId) {
            const doctorPool = [2, 3, 4, 5];
            effectiveDoctorId = doctorIdRaw
                ? Number(doctorIdRaw)
                : doctorPool[Math.floor(Math.random() * doctorPool.length)];
        }

        if (!effectiveLocationId) {
            effectiveLocationId = locationIdRaw ? Number(locationIdRaw) : 5;
        }

        const cabinetForIstoma = effectiveLocationId;

        // Apelează direct AdaugaProgramare în Istoma
        const responseData = await IstomaService.addAppointment(
            patientPayload,
            date,
            time,
            30,
            effectiveDoctorId,
            cabinetForIstoma
        );

        // Refolosim aceeași logică de success ca în ConversationManager:
        let isSuccess = false;
        if (typeof responseData === 'string') {
            const responseText = responseData.trim();
            isSuccess =
                responseText === '13' ||
                responseText === '200' ||
                responseText.startsWith('13 ') ||
                responseText.includes('<string>13</string>') ||
                responseText.includes('>13<') ||
                responseText.includes('<string>200</string>') ||
                responseText.includes('>200<');
        } else if (typeof responseData === 'number') {
            isSuccess = responseData === 13 || responseData === 200;
        } else if (responseData && typeof responseData === 'object') {
            const respStr = String(
                responseData.response ||
                responseData.message ||
                responseData.Message ||
                responseData.string ||
                responseData
            );
            isSuccess = respStr.includes('13') || respStr.includes('200');
        }

        if (!isSuccess) {
            console.error('Autocall booking failed in Istoma. Raw response:', responseData);
            return res.status(500).json({ error: 'Istoma booking failed', raw: responseData });
        }

        // Logăm programarea și în AppointmentStore pentru dashboard / website
        AppointmentStore.add({
            source: 'autocall',
            status: 'confirmed',
            patientPhone: normalizedPhone,
            patientName: fullName,
            date,
            time,
            doctorId: effectiveDoctorId,
            cabinetId: effectiveLocationId,
            raw: responseData
        });

        // Trimite mesaj de confirmare pe WhatsApp către pacient, cu doctor și adresă
        // Folosim template WhatsApp pentru a evita eroarea "Re-engagement message"
        const doctorName = getDoctorName(effectiveDoctorId);
        const locInfo = getLocationInfo(effectiveLocationId);
        const fullAddress = locInfo.address ? `${locInfo.name}, ${locInfo.address}` : locInfo.name;
        
        // Template WhatsApp: confirmare_programare1
        // Variabile: {{1}} = Data, {{2}} = Ora, {{3}} = Medic, {{4}} = Locație + Adresă
        const templateSent = await WhatsappService.sendTemplate(
            normalizedPhone,
            'confirmare_programare1', // Numele template-ului din Meta Business Manager
            'ro', // Codul limbii (română)
            [
                {
                    type: 'body',
                    parameters: [
                        { type: 'text', text: date },           // {{1}} = Data (ex: "29.01.2026")
                        { type: 'text', text: time },           // {{2}} = Ora (ex: "20:00")
                        { type: 'text', text: doctorName },     // {{3}} = Medic (ex: "Dr. PAVEL Iulia")
                        { type: 'text', text: fullAddress }     // {{4}} = Locație + Adresă (ex: "SUPERSMILE SIBIU, Str. Octav Doicescu...")
                    ]
                }
            ]
        );
        
        if (!templateSent) {
            console.warn('[AUTOCALL] WhatsApp template failed, trying fallback text message');
            // Fallback: încercăm mesaj text simplu (poate funcționa dacă clientul a răspuns recent)
            const confirmText = `Programarea ta a fost înregistrată pentru ${date} la ora ${time}, la ${locInfo.name}${locInfo.address ? ', ' + locInfo.address : ''}, la ${doctorName}.`;
            await WhatsappService.sendMessage(normalizedPhone, confirmText);
        } else {
            console.log('[AUTOCALL] WhatsApp template sent successfully');
        }

        // Trimite email cu rezumatul conversației și înregistrarea (dacă există)
        const emailTo = process.env.EMAIL_TO || process.env.SMTP_USER; // Email destinatar (din .env)
        if (emailTo) {
            const transcript = rawBody.formatted_transcript || rawBody.transcript || null;
            const recordingUrl = rawBody.recording || rawBody.recording_url || null;

            const appointmentData = {
                date,
                time,
                patientName: fullName,
                patientPhone: normalizedPhone,
                doctorName,
                locationName: locInfo.name,
                locationAddress: locInfo.address
            };

            // Trimite email asincron (nu blocăm răspunsul webhook-ului)
            EmailService.sendAutocallSummary(emailTo, appointmentData, transcript, recordingUrl)
                .then(result => {
                    if (result.success) {
                        console.log('[AUTOCALL] Email summary sent successfully to', emailTo);
                    } else {
                        console.error('[AUTOCALL] Email summary failed:', result.error);
                    }
                })
                .catch(err => {
                    console.error('[AUTOCALL] Email summary error:', err.message);
                });
        } else {
            console.warn('[AUTOCALL] EMAIL_TO not configured, skipping email summary');
        }

        return res.json({ ok: true, istomaResponse: responseData });
    } catch (err) {
        console.error('Error in /api/autocall/book:', err);
        return res.status(500).json({ error: err.message || 'Internal error' });
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
