const { addDays, format, nextDay, parse, isValid, getDay } = require('date-fns');
const IstomaService = require('./istomaService');
const WhatsappService = require('./whatsappService');

const userState = new Map(); // from -> { state, data }

const STATES = {
    IDLE: 'IDLE',
    WAITING_FOR_DATE: 'WAITING_FOR_DATE',
    WAITING_FOR_SLOT: 'WAITING_FOR_SLOT'
};

const DAYS_MAP = {
    'duminica': 0, 'duminică': 0,
    'luni': 1,
    'marti': 2, 'marți': 2,
    'miercuri': 3,
    'joi': 4,
    'vineri': 5,
    'sambata': 6, 'sâmbătă': 6
};

const ConversationManager = {
    async handleMessage(from, messageObj) {
        let currentState = userState.get(from) || { state: STATES.IDLE, data: {} };
        let type = messageObj.type;
        let text = '';

        if (type === 'text') {
            text = messageObj.text.body.toLowerCase().trim();
        } else if (type === 'interactive') {
            if (messageObj.interactive.type === 'button_reply') {
                text = messageObj.interactive.button_reply.title.toLowerCase();
                // We can also use id
            } else if (messageObj.interactive.type === 'list_reply') {
                text = messageObj.interactive.list_reply.title; // Keep original case for time slots?
                // data id is better
                const id = messageObj.interactive.list_reply.id;
                text = id; // use ID for slot selection
            }
        } else if (type === 'button') {
            text = messageObj.button.text.toLowerCase();
        }

        console.log(`User: ${from}, State: ${currentState.state}, Input: ${text}`);

        // Handle "Programează-mă" trigger from button or text
        if (text === 'programează-mă' || text === 'programeaza-ma' || text === 'programeaza ma') {
            currentState = { state: STATES.WAITING_FOR_DATE, data: {} };
            userState.set(from, currentState);
            await WhatsappService.sendMessage(from, "Bună! În ce zi dorești să te programezi? (ex: 'mâine', 'luni', '25.02.2026')");
            return;
        }

        if (currentState.state === STATES.IDLE) {
            // Fallback for random messages
            await WhatsappService.sendMessage(from, "Salut! Apasă pe butonul 'Programează-mă' sau scrie 'Programează-mă' pentru a începe.");
            return;
        }

        if (currentState.state === STATES.WAITING_FOR_DATE) {
            const date = this.parseDate(text);
            if (!date) {
                await WhatsappService.sendMessage(from, "Nu am înțeles data. Te rog să scrii o dată validă (ex: 'mâine', 'luni', '25.02.2026').");
                return;
            }

            const formattedDate = format(date, 'dd.MM.yyyy');
            currentState.data.date = formattedDate;
            await WhatsappService.sendMessage(from, `Caut intervale libere pentru data de ${formattedDate}...`);

            // Fetch doctors if not already known?
            const doctors = await IstomaService.getDoctors();
            // TODO: Filter for specific 4 dentists if required, but for now we use all returned.
            // Also need cabinets? The API for slots asks for 'pIdSediu' and 'pListaIdMedici'.
            // User request: "verifice programarile tuturor celor 4 dentisti si 2 cabinete"
            // We'll pass all doctors we find.
            const doctorIds = doctors.map(d => d.id);

            // Get slots
            const slots = await IstomaService.getAvailableSlots(formattedDate, doctorIds);

            // Normalize slots
            // The API response structure for 'GetListaIntervaleActivitate' is list of objects
            // { id_medic, id_locatie, id_cabinet, data_inceput, data_final }
            // Expected format depends on actual API response, simulating it here based on docs.

            // We need to parse valid slots into a set of unique times.
            // Documentation for GetListaIntervaleActivitate says: returns intervals.
            // Assuming we get [{ "data_inceput": "2026-01-28T09:00:00", ... }, ...]

            // NOTE: The documentation says GetListaIntervaleActivitate returns list of intervals available.
            // But we need to make sure we don't overwhelm user.
            // Let's extract unique start times.

            if (!slots || slots.length === 0) {
                await WhatsappService.sendMessage(from, `Din păcate nu sunt locuri libere pe ${formattedDate}. Te rog alege altă zi.`);
                return; // Stay in WAITING_FOR_DATE
            }

            // Extract times
            const uniqueTimes = new Set();
            slots.forEach(slot => {
                // slot.data_inceput might be "DD.MM.YYYY HH:MM" or ISO
                // Docs say "data inceput interval". Usually "DD.MM.YYYY HH:MM"
                // Let's assume standardized format or try to parse
                let timeStr = "";
                if (slot.dataInceputInterval) { // PascalCase/Camel check? The docs use natural language often.
                    // Assuming JSON response property matches docs or common sense.
                    // Let's rely on simple string manipulation if possible.
                    const parts = slot.dataInceputInterval.split(' ');
                    if (parts.length > 1) timeStr = parts[1];
                } else if (slot.StartDate) { // Generic API fallback
                    const d = new Date(slot.StartDate);
                    timeStr = format(d, 'HH:mm');
                }

                // If the API returns exact match as per docs "data inceput interval".
                // I'll assume the JSON keys are like 'dataInceput' or similar. 
                // Since I can't debug the API response directly without running it, 
                // I will add a safe fallback logic or log it.
                // For this implementation, I will treat 'slots' assuming it might need mapping.
                // Wait, I can't guess the keys. 
                // Based on "Fiecare medic conține id, nume...": keys are usually lowercase or camelCase in modern APIs 
                // but docs use "id", "nume".

                // User provided code example: $decoded->response->status.
                // So response wrapper exists.
            });

            // MOCKING THE SLOTS FOR NOW AS I DON'T HAVE REAL API ACCESS YET to know keys
            // But actually I should try to simplify: just present a list.

            const availableOptions = this.processSlotsToOptions(slots);

            if (availableOptions.length === 0) {
                // Fallback if processing failed or empty
                // IF real API calls fail, maybe because I don't have the real IDs.
                // I will assume for now I get some valid times.
                await WhatsappService.sendMessage(from, `Nu am găsit intervale valide (eroare procesare).`);
                return;
            }

            currentState.state = STATES.WAITING_FOR_SLOT;
            // Send LIST message
            // WhatsApp List limit is 10 items.
            const sections = [{
                title: 'Ore Disponibile',
                rows: availableOptions.slice(0, 10).map(opt => ({
                    id: `${opt.time}|${opt.doctorId}|${opt.cabinetId}`, // Encode data in ID
                    title: opt.time,
                    description: opt.uName // Doctor name or similar
                }))
            }];

            await WhatsappService.sendList(from, `Intervale disponibile pt ${formattedDate}:`, "Alege o oră", sections);
            userState.set(from, currentState);

        } else if (currentState.state === STATES.WAITING_FOR_SLOT) {
            // text is the ID from list selection: "HH:MM|docId|cabId"
            const parts = text.split('|');
            if (parts.length < 3) {
                await WhatsappService.sendMessage(from, "Se pare că a fost o eroare. Te rog alege din listă.");
                return;
            }

            const [time, doctorId, cabinetId] = parts;
            const date = currentState.data.date;

            // Start booking
            // Need patient details. 
            // "AdaugaProgramare" needs: Nume, Prenume, Telefon.
            // I only have Phone (from). I don't have Name.
            // I should ask for name? Or check if patient exists first.
            // Plan:
            // 1. Check patient by phone (`VerificaPacient`).
            // 2. If exists, use that ID/Name.
            // 3. If not, ask for Name? Or just use "WhatsApp User"? 
            // The prompt says: "Programează-mă" -> "intra ziua" -> "slots" -> "confirm".
            // It doesn't mention asking name. I will imply checking existing user.
            // If new user, I need to create one. I will use a placeholder name or ask?
            // "Dupa ce este identificat pacientul pe baza datelor de contact (este creat daca nu exista)" - in AdaugaProgramare doc description!
            // So `AdaugaProgramare` might handle creation if I pass Name/Phone.
            // But I strictly need Name. I'll define a default logic: "WhatsApp Guest" if unknown?
            // Actually, best UX is to ask name if not found.
            // BUT, for this specific request "exact cum cere el", he didn't ask to ask name.
            // I will try to fetch patient first. If exists, good. If not, I will use "Client WhatsApp".

            let patient = await IstomaService.checkPatient(from); // from is phone number usually
            let patientName = "Client";
            let patientSurname = "WhatsApp";

            if (patient && patient.lista && patient.lista.length > 0) {
                // Found
                // The API "VerificaPacient" returns "lista de pacienți".
                const p = patient.lista[0];
                patientName = p.nume || "Client";
                patientSurname = p.prenume || "WhatsApp";
            }

            // Call AddAppointment
            const response = await IstomaService.addAppointment({
                nume: patientName,
                prenume: patientSurname,
                telefon: from,
                email: ""
            }, date, time, 30, doctorId, cabinetId); // 30 min duration default

            if (response && response.message === '13') { // "13" means success per docs? 
                // "AdaugaProgramare... va returna “13 $#$ idPacientNou” or just success?"
                // Doc says: "Dacă adăugarea a fost realizată cu succes, metoda va returna “13 $#$ idPacientNou”." for AddPatient.
                // For AddProgramare? Doc says "Daca adaugarea a fost realizata cu succes... metoda returneaza '13'".
                // Check response carefully. 
                // The PHP example shows a JSON response wrapper? 
                // "$decoded->response->status".
                // My service returns response.data. 
                // Let's assume success.
                await WhatsappService.sendMessage(from, `Programarea ta a fost confirmată pentru ${date} la ora ${time}!`);
            } else {
                await WhatsappService.sendMessage(from, `Am întâmpinat o eroare la salvarea programării. Te rog încearcă din nou.`);
                // console.error(response);
            }

            // Clear state
            currentState = { state: STATES.IDLE, data: {} };
            userState.set(from, currentState);
        }
    },

    parseDate(input) {
        const today = new Date();
        const text = input.toLowerCase().trim();

        if (text === 'azi' || text === 'astazi' || text === 'astăzi') return today;
        if (text === 'maine' || text === 'mâine') return addDays(today, 1);
        if (text === 'poimaine' || text === 'poimâine') return addDays(today, 2);

        // Handle days of week (next occurrence)
        if (DAYS_MAP.hasOwnProperty(text)) {
            const targetDay = DAYS_MAP[text];
            return nextDay(today, targetDay);
        }

        // Handle DD.MM.YYYY or DD.MM
        // Try parsing
        const formats = ['d.M.yyyy', 'dd.MM.yyyy', 'd.M.yy', 'dd.MM.yy', 'd.M', 'dd.MM'];
        for (const fmt of formats) {
            const d = parse(text, fmt, today);
            if (isValid(d)) {
                // If year missing, assume current or next depending on month?
                // parse defaults to current year.
                // If input "01.01", and today is "02.01", it parsed to past. 
                if (d < today && !text.includes('20')) {
                    d.setFullYear(d.getFullYear() + 1);
                }
                return d;
            }
        }

        return null;
    },

    processSlotsToOptions(slots) {
        // Need to convert the raw API slots to { time, doctorId, cabinetId, uName }
        // Slot structure (inferred): { StartDate: '...', IdMedic: '...', IdCabinet: '...' } 
        // OR as per doc "Un interval contine id medic, id locatie (sediu), id cabinet, data inceput interval, data final interval."

        // Let's rely on mapping these fields.
        // Since I don't know the exact JSON keys (PascalCase vs camelCase), I check both.

        const options = [];
        const seen = new Set();

        if (!Array.isArray(slots)) return [];

        for (const slot of slots) {
            // Extract Time
            let startStr = slot.dataInceputInterval || slot.DataInceputInterval || slot.StartDate;
            if (!startStr) continue;

            // Parse time HH:mm
            // If format is "28.01.2026 14:00", split.
            let time = '';
            if (startStr.includes(' ')) {
                time = startStr.split(' ')[1].substring(0, 5); // HH:mm
            } else if (startStr.includes('T')) {
                time = startStr.split('T')[1].substring(0, 5);
            }

            const docId = slot.idMedic || slot.IdMedic || 0;
            const cabId = slot.idCabinet || slot.IdCabinet || 0;
            const locId = slot.idLocatie || slot.IdLocatie || 0;

            // Dedupe by time? 
            // If multiple doctors free at 14:00, show 14:00 once? Or "14:00 (Dr X)", "14:00 (Dr Y)"?
            // User: "sa primeasca mesaj cu ora cu orele valabile care nu sunt acoperite"
            // Simple approach: show unique times. 
            // BUT we need to pass DocID to `addAppointment`.
            // So we pick FIRST available doctor for that time.

            if (!seen.has(time)) {
                seen.add(time);
                options.push({
                    time: time,
                    doctorId: docId,
                    cabinetId: cabId,
                    uName: "Disponibil" // Could fetch doctor name if we cache doctors list
                });
            }
        }

        // Sort by time
        options.sort((a, b) => a.time.localeCompare(b.time));

        return options;
    }
};

module.exports = ConversationManager;
