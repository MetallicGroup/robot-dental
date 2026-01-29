const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const { addDays, format, parse } = require('date-fns');
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

/**
 * Caută disponibilități în zilele următoare pentru medicul specificat sau toți medicii
 * @param {number|null} doctorId - ID-ul medicului (null pentru toți medicii)
 * @param {number[]} allDoctorIds - Lista tuturor ID-urilor medicilor
 * @param {number[]} locationIds - Lista ID-urilor locațiilor
 * @param {string} startDate - Data de început în format DD.MM.YYYY
 * @param {number} daysToCheck - Numărul de zile de verificat (default: 14)
 * @returns {Promise<Object>} - Obiect cu disponibilități grupate pe zile: { "DD.MM.YYYY": { doctorId: ["HH:MM", ...] } }
 */
async function findAvailabilityInNextDays(doctorId, allDoctorIds, locationIds, startDate, daysToCheck = 14) {
    const availabilityByDay = {};
    const doctorsToCheck = doctorId ? [doctorId] : allDoctorIds;
    
    // Parsează data de început
    const [day, month, year] = startDate.split('.');
    let currentDate = new Date(Number(year), Number(month) - 1, Number(day));
    
    // Caută disponibilități pentru fiecare zi
    for (let i = 1; i <= daysToCheck; i++) {
        const checkDate = addDays(currentDate, i);
        const formattedDate = format(checkDate, 'dd.MM.yyyy');
        
        try {
            // Caută sloturi pentru toți medicii în această zi
            const slots = await IstomaService.getAvailableSlots(
                formattedDate,
                doctorsToCheck,
                locationIds
            );
            
            if (slots && slots.length > 0) {
                // Grupează sloturile pe medic și ora
                const slotsByDoctor = {};
                
                slots.forEach(slot => {
                    const slotDoctorId = Number(slot.IdMedic || slot.idMedic);
                    if (!doctorsToCheck.includes(slotDoctorId)) return;
                    
                    const startTime = new Date(slot.DataInceputInterval || slot.dataInceputInterval);
                    const timeStr = format(startTime, 'HH:mm');
                    
                    if (!slotsByDoctor[slotDoctorId]) {
                        slotsByDoctor[slotDoctorId] = [];
                    }
                    
                    // Adaugă ora doar dacă nu există deja (evită duplicate)
                    if (!slotsByDoctor[slotDoctorId].includes(timeStr)) {
                        slotsByDoctor[slotDoctorId].push(timeStr);
                    }
                });
                
                // Sortează orele pentru fiecare medic
                Object.keys(slotsByDoctor).forEach(docId => {
                    slotsByDoctor[docId].sort();
                });
                
                if (Object.keys(slotsByDoctor).length > 0) {
                    availabilityByDay[formattedDate] = slotsByDoctor;
                }
            }
        } catch (error) {
            console.error(`[ERROR] Failed to check availability for ${formattedDate}:`, error.message);
            // Continuă cu următoarea zi chiar dacă aceasta a eșuat
        }
    }
    
    return availabilityByDay;
}

/**
 * Formatează disponibilitățile într-un mesaj WhatsApp ușor de citit
 * @param {Object} availabilityByDay - Disponibilități grupate pe zile
 * @param {number|null} requestedDoctorId - ID-ul medicului solicitat (null pentru toți)
 * @returns {string} - Mesaj formatat
 */
function formatAvailabilityMessage(availabilityByDay, requestedDoctorId) {
    if (Object.keys(availabilityByDay).length === 0) {
        return 'Nu am găsit disponibilități în următoarele 14 zile. Te rugăm să contactezi recepția pentru mai multe opțiuni.';
    }
    
    let message = '📅 Disponibilități în următoarele zile:\n\n';
    
    // Sortează zilele cronologic
    const sortedDays = Object.keys(availabilityByDay).sort((a, b) => {
        const [dayA, monthA, yearA] = a.split('.');
        const [dayB, monthB, yearB] = b.split('.');
        const dateA = new Date(Number(yearA), Number(monthA) - 1, Number(dayA));
        const dateB = new Date(Number(yearB), Number(monthB) - 1, Number(dayB));
        return dateA - dateB;
    });
    
    sortedDays.forEach(date => {
        const dayAvailability = availabilityByDay[date];
        message += `📆 ${date}:\n`;
        
        Object.keys(dayAvailability).forEach(doctorId => {
            const doctorName = getDoctorName(Number(doctorId));
            const times = dayAvailability[doctorId];
            
            // Găsește locația pentru acest medic (din primul slot găsit)
            // Pentru simplitate, nu afișăm locația aici, doar medicul și orele
            message += `  👨‍⚕️ ${doctorName}: ${times.join(', ')}\n`;
        });
        
        message += '\n';
    });
    
    message += 'Scrie data și ora dorită (ex: "30.01.2026 la ora 15") sau "schimbă programarea" pentru a alege.';
    
    return message;
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
// GET /api/autocall/slots?date=28.01.2026&time=20:00&doctor_id=2
// Endpoint pentru mid-call tool Autocalls: verifică disponibilitatea medicilor
app.get('/api/autocall/slots', async (req, res) => {
    console.log('[AUTOCALL TOOL] Incoming request to /api/autocall/slots:', {
        query: req.query,
        headers: req.headers
    });
    
    const { date, time, doctor_id, location_id } = req.query || {};

    // Pentru testele Autocalls cu "Example value", returnăm un răspuns de test IMEDIAT
    if (date === 'Example value' || (time && time === 'Example value')) {
        return res.json({
            date: 'Example value',
            time: time || null,
            doctor_id: doctor_id ? Number(doctor_id) : null,
            available: false,
            doctors: [
                {
                    doctorId: 2,
                    doctorName: 'Dr. PAVEL Iulia',
                    locations: [
                        {
                            locationId: 5,
                            locationName: 'SUPERSMILE SIBIU',
                            address: 'Str. Octav Doicescu',
                            times: ['10:00', '11:00', '14:00', '15:00']
                        }
                    ]
                },
                {
                    doctorId: 4,
                    doctorName: 'Dr. COROIAN Andrei',
                    locations: [
                        {
                            locationId: 5,
                            locationName: 'SUPERSMILE SIBIU',
                            address: 'Str. Octav Doicescu',
                            times: ['09:00', '10:00', '16:00', '17:00']
                        }
                    ]
                }
            ],
            message: 'Acesta este un răspuns de test. Pentru verificare reală, folosește date valide în format DD.MM.YYYY și HH:MM.'
        });
    }

    // Validare pentru date - verifică că există și nu este gol
    if (!date || date.trim() === '') {
        return res.status(400).json({ 
            error: 'date (DD.MM.YYYY) este obligatoriu',
            message: 'Parametrul date trebuie să fie în format DD.MM.YYYY (ex: "29.01.2026")',
            received: date,
            usage: 'Folosește: /api/autocall/slots?date=29.01.2026&time=20:00&doctor_id=4',
            example: 'https://robot-dental.onrender.com/api/autocall/slots?date=29.01.2026&time=20:00'
        });
    }

    // Validare format date: trebuie să fie DD.MM.YYYY
    const datePattern = /^\d{2}\.\d{2}\.\d{4}$/;
    if (!datePattern.test(date)) {
        return res.status(400).json({ 
            error: 'Format date invalid',
            message: 'Data trebuie să fie în format DD.MM.YYYY (ex: "29.01.2026")',
            received: date
        });
    }

    // Validare pentru time dacă este furnizat
    if (time && time.trim() !== '') {
        const timePattern = /^\d{2}:\d{2}$/;
        if (!timePattern.test(time)) {
            return res.status(400).json({ 
                error: 'Format time invalid',
                message: 'Ora trebuie să fie în format HH:MM (ex: "20:00")',
                received: time
            });
        }
    }

    try {
        // Dacă avem locationId, filtrăm doar pe acel sediu, altfel lăsăm 0 (toate sediile)
        const locationIds = location_id ? [Number(location_id)] : [];
        const doctorIds = doctor_id ? [Number(doctor_id)] : []; // gol = toți medicii

        const slots = await IstomaService.getAvailableSlots(date, doctorIds, locationIds);

        if (!slots || slots.length === 0) {
            return res.json({
                date,
                time: time || null,
                doctor_id: doctor_id ? Number(doctor_id) : null,
                available: false,
                doctors: [],
                message: `Nu am găsit niciun interval disponibil în Istoma pentru data de ${date}${time ? ` la ora ${time}` : ''}${doctor_id ? ` pentru medicul ${getDoctorName(Number(doctor_id))}` : ''}.`
            });
        }

        // Dacă avem time specificat, filtrăm doar sloturile care acoperă acea oră
        let filteredSlots = slots;
        if (time) {
            const requestedDateTime = parseRoDateTime(date, time);
            if (requestedDateTime) {
                filteredSlots = slots.filter(slot => {
                    const startStr = slot.DataInceputInterval || slot.dataInceputInterval || slot.StartDate;
                    const endStr = slot.DataFinalInterval || slot.dataFinalInterval || slot.EndDate;
                    if (!startStr || !endStr) return false;

                    const start = new Date(startStr);
                    const end = new Date(endStr);
                    if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;

                    return requestedDateTime >= start && requestedDateTime < end;
                });
            }
        }

        // Dacă avem doctor_id specificat și time, verificăm dacă medicul este disponibil la ora respectivă
        if (doctor_id && time && filteredSlots.length === 0) {
            const doctorName = getDoctorName(Number(doctor_id));
            return res.json({
                date,
                time,
                doctor_id: Number(doctor_id),
                doctor_name: doctorName,
                available: false,
                doctors: [],
                message: `${doctorName} nu are program disponibil la ora ${time} în ziua ${date}.`
            });
        }

        // Dacă avem doctor_id specificat dar nu găsim sloturi pentru el în ziua respectivă
        if (doctor_id && filteredSlots.length === 0 && !time) {
            const doctorName = getDoctorName(Number(doctor_id));
            return res.json({
                date,
                doctor_id: Number(doctor_id),
                doctor_name: doctorName,
                available: false,
                doctors: [],
                message: `${doctorName} nu are program în ziua ${date}.`
            });
        }

        // Grupăm sloturile pe doctor și locație
        const doctorMap = {};

        for (const slot of filteredSlots) {
            const docId = Number(slot.IdMedic || slot.idMedic || slot.IDMedic);
            const locId = Number(slot.IdLocatie || slot.idLocatie || slot.IDLocatie);
            const startStr =
                slot.DataInceputInterval ||
                slot.dataInceputInterval ||
                slot.StartDate ||
                slot.dataInceput;

            if (!docId || !startStr) continue;

            // Extragem ora HH:MM
            let slotTime = '';
            if (startStr.includes('T')) {
                slotTime = startStr.split('T')[1].substring(0, 5);
            } else if (startStr.includes(' ')) {
                slotTime = startStr.split(' ')[1].substring(0, 5);
            }
            if (!slotTime) continue;

            if (!doctorMap[docId]) {
                doctorMap[docId] = {};
            }
            if (!doctorMap[docId][locId]) {
                doctorMap[docId][locId] = new Set();
            }
            doctorMap[docId][locId].add(slotTime);
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

        // Dacă avem time și doctor_id specificat și găsim sloturi, medicul este disponibil
        const isAvailable = time && doctor_id && filteredSlots.length > 0;

        const response = {
            date,
            time: time || null,
            doctor_id: doctor_id ? Number(doctor_id) : null,
            available: isAvailable,
            doctors
        };

        console.log('[AUTOCALL TOOL] Returning response:', JSON.stringify(response, null, 2));

        return res.json(response);
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

        // 1) VERIFICARE OBLIGATORIE: Citește programul real din Istoma și verifică disponibilitatea
        const requestedDateTime = parseRoDateTime(date, time);
        let effectiveDoctorId = null;
        let effectiveLocationId = null;
        let availabilityError = null;

        if (!requestedDateTime) {
            return res.status(400).json({ 
                error: 'Data sau ora invalidă',
                message: 'Nu am putut interpreta data sau ora programării. Te rugăm să încerci din nou.'
            });
        }

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

            // Dacă clientul a specificat un medic anume, verificăm dacă este disponibil
            if (doctorIdRaw) {
                const requestedDoctorId = Number(doctorIdRaw);
                const doctorSlots = matchingSlots.filter(
                    s => Number(s.IdMedic || s.idMedic) === requestedDoctorId
                );

                if (doctorSlots.length === 0) {
                    // Verificăm dacă medicul lucrează în ziua respectivă dar nu la ora respectivă
                    const allDoctorSlots = slots.filter(
                        s => Number(s.IdMedic || s.idMedic) === requestedDoctorId
                    );

                    const doctorName = getDoctorName(requestedDoctorId);
                    
                    // Găsim medici alternativi disponibili la ora respectivă
                    const alternativeDoctors = matchingSlots.map(slot => {
                        const docId = Number(slot.IdMedic || slot.idMedic);
                        const locId = Number(slot.IdLocatie || slot.idLocatie);
                        return {
                            doctorId: docId,
                            doctorName: getDoctorName(docId),
                            locationId: locId,
                            locationInfo: getLocationInfo(locId)
                        };
                    });

                    let whatsappMessage = '';
                    if (allDoctorSlots.length === 0) {
                        whatsappMessage = `Îmi pare rău, dar ${doctorName} nu are program în ziua ${date}.`;
                    } else {
                        whatsappMessage = `Îmi pare rău, dar ${doctorName} este ocupat la ora ${time} în ziua ${date}.`;
                    }

                    if (alternativeDoctors.length > 0) {
                        whatsappMessage += `\n\nÎn schimb, la ora ${time} în ziua ${date} sunt disponibili următorii medici:\n`;
                        alternativeDoctors.forEach((alt, idx) => {
                            whatsappMessage += `${idx + 1}. ${alt.doctorName} - ${alt.locationInfo.name}\n`;
                        });
                        whatsappMessage += `\n\nScrie "vreau altă oră" sau "schimbă programarea" pentru a alege o altă oră sau dată.`;
                        
                        console.log('[AUTOCALL] Requested doctor not available, sending WhatsApp with alternatives');
                        
                        // Trimitem mesaj WhatsApp cu alternative
                        try {
                            const alternativeList = `În schimb, la ora ${time} în ziua ${date} sunt disponibili următorii medici:\n${alternativeDoctors.map((alt, idx) => `${idx + 1}. ${alt.doctorName} - ${alt.locationInfo.name}`).join('\n')}`;
                            
                            // Încearcă să folosească template-ul pentru alternative (dacă există)
                            const templateSent = await WhatsappService.sendTemplate(
                                normalizedPhone,
                                'alternative_disponibile',
                                'ro',
                                [
                                    {
                                        type: 'body',
                                        parameters: [
                                            { type: 'text', text: doctorName },     // {{1}} = Numele medicului solicitat
                                            { type: 'text', text: time },           // {{2}} = Ora solicitată
                                            { type: 'text', text: date },           // {{3}} = Data solicitată
                                            { type: 'text', text: alternativeList } // {{4}} = Lista alternative
                                        ]
                                    }
                                ]
                            );
                            
                            if (!templateSent) {
                                // Fallback: folosim mesaj text simplu (poate eșua dacă au trecut >24h)
                                await WhatsappService.sendMessage(normalizedPhone, whatsappMessage);
                                console.log('[AUTOCALL] WhatsApp text message sent with alternatives (template not available)');
                            } else {
                                console.log('[AUTOCALL] WhatsApp template sent with alternatives');
                            }
                        } catch (waError) {
                            console.error('[AUTOCALL] Failed to send WhatsApp message:', waError.message || waError);
                        }
                    } else {
                        // Nu există alternative disponibile la ora respectivă - caută în zilele următoare
                        console.log('[AUTOCALL] No alternatives available, searching for availability in next days');
                        
                        try {
                            // Obține toți medicii și locațiile
                            const [doctors, locations] = await Promise.all([
                                IstomaService.getDoctors(),
                                IstomaService.getLocations()
                            ]);
                            
                            let allDoctorIds = doctors.map(d => d.Id || d.id || d.ID).filter(id => id && id !== 0);
                            let allLocationIds = locations.map(l => l.ID || l.id || l.Id).filter(id => id && id !== 0);
                            
                            if (allDoctorIds.length === 0) allDoctorIds = [2, 3, 4, 5];
                            if (allLocationIds.length === 0) allLocationIds = [3, 5, 11];
                            
                            // Caută disponibilități în următoarele 14 zile pentru medicul solicitat (sau toți medicii)
                            const availabilityByDay = await findAvailabilityInNextDays(
                                requestedDoctorId,
                                allDoctorIds,
                                allLocationIds,
                                date,
                                14
                            );
                            
                            // Formatează mesajul cu disponibilități
                            const availabilityMessage = formatAvailabilityMessage(availabilityByDay, requestedDoctorId);
                            
                            // Trimite mesajul cu disponibilități
                            await WhatsappService.sendMessage(normalizedPhone, availabilityMessage);
                            console.log('[AUTOCALL] WhatsApp message sent with availability in next days');
                            
                        } catch (error) {
                            console.error('[AUTOCALL] Failed to search availability in next days:', error);
                            // Fallback: mesaj simplu
                            await WhatsappService.sendMessage(
                                normalizedPhone,
                                `Nu există medici disponibili la ora ${time} în ziua ${date}. Te rugăm să alegi altă oră sau altă dată.\n\nScrie "vreau altă oră" sau "schimbă programarea" pentru a alege o altă opțiune.`
                            );
                        }
                    }
                    
                    // Returnăm success (am trimis mesaj cu alternative)
                    return res.status(200).json({
                        ok: true,
                        message: 'Medicul solicitat nu este disponibil, dar am trimis mesaj WhatsApp cu alternative',
                        doctor_id: requestedDoctorId,
                        doctor_name: doctorName,
                        alternatives: alternativeDoctors,
                        whatsapp_sent: true
                    });
                }

                // Medicul este disponibil, folosim primul slot disponibil pentru el
                const chosenSlot = doctorSlots[0];
                effectiveDoctorId = requestedDoctorId;
                effectiveLocationId = Number(chosenSlot.IdLocatie || chosenSlot.idLocatie) || null;

                console.log('[AUTOCALL] Requested doctor is available:', {
                    effectiveDoctorId,
                    effectiveLocationId
                });
            } else {
                // Clientul nu a specificat medic, alegem din medicii disponibili
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
            }

            // Dacă nu am găsit niciun slot disponibil la ora respectivă
            if (!effectiveDoctorId && matchingSlots.length === 0) {
                console.log('[AUTOCALL] No slots available, searching for availability in next days');
                
                try {
                    // Obține toți medicii și locațiile
                    const [doctors, locations] = await Promise.all([
                        IstomaService.getDoctors(),
                        IstomaService.getLocations()
                    ]);
                    
                    let allDoctorIds = doctors.map(d => d.Id || d.id || d.ID).filter(id => id && id !== 0);
                    let allLocationIds = locations.map(l => l.ID || l.id || l.Id).filter(id => id && id !== 0);
                    
                    if (allDoctorIds.length === 0) allDoctorIds = [2, 3, 4, 5];
                    if (allLocationIds.length === 0) allLocationIds = [3, 5, 11];
                    
                    // Caută disponibilități în următoarele 14 zile pentru toți medicii
                    const availabilityByDay = await findAvailabilityInNextDays(
                        null, // null = toți medicii
                        allDoctorIds,
                        allLocationIds,
                        date,
                        14
                    );
                    
                    // Formatează mesajul cu disponibilități
                    const availabilityMessage = formatAvailabilityMessage(availabilityByDay, null);
                    
                    // Trimite mesajul cu disponibilități
                    await WhatsappService.sendMessage(normalizedPhone, availabilityMessage);
                    console.log('[AUTOCALL] WhatsApp message sent with availability in next days');
                    
                } catch (error) {
                    console.error('[AUTOCALL] Failed to search availability in next days:', error);
                    // Fallback: mesaj simplu
                    const whatsappMessage = `Îmi pare rău, dar nu există programări disponibile la ora ${time} în ziua ${date}.\n\nTe rugăm să alegi altă oră sau altă dată. Scrie "vreau altă oră" sau "schimbă programarea" pentru a alege o altă opțiune.`;
                    await WhatsappService.sendMessage(normalizedPhone, whatsappMessage);
                }
                
                // Returnăm success (am trimis mesaj cu disponibilități)
                return res.status(200).json({
                    ok: true,
                    message: 'Nu există disponibilitate la ora solicitată, dar am trimis mesaj WhatsApp cu disponibilități în zilele următoare',
                    date,
                    time,
                    whatsapp_sent: true
                });
            }

        } catch (e) {
            console.error('[AUTOCALL] Error while fetching/matching Istoma slots:', e);
            return res.status(500).json({
                error: 'Eroare la verificarea disponibilității',
                message: 'Nu am putut verifica disponibilitatea în sistemul clinicii. Te rugăm să încerci din nou sau să contactezi recepția.'
            });
        }

        // 2) Dacă nu am găsit sloturi potrivite, NU folosim fallback - returnăm eroare
        if (!effectiveDoctorId) {
            return res.status(400).json({
                error: 'Nu există disponibilitate',
                message: `Nu am găsit medici disponibili la ora ${time} în ziua ${date}.`,
                date,
                time
            });
        }

        if (!effectiveLocationId) {
            effectiveLocationId = locationIdRaw ? Number(locationIdRaw) : 5; // Fallback doar pentru locație
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

        // Trimite mesaj cu instrucțiuni pentru schimbare programare (după un mic delay pentru a nu fi blocat)
        setTimeout(async () => {
            try {
                const changeInstructions = `💡 Dacă vrei să schimbi programarea, scrie "schimbă programarea" sau "vreau altă oră" și îți voi sugera alternative disponibile.`;
                await WhatsappService.sendMessage(normalizedPhone, changeInstructions);
            } catch (err) {
                console.error('[AUTOCALL] Failed to send change instructions:', err);
            }
        }, 2000); // Delay de 2 secunde

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
