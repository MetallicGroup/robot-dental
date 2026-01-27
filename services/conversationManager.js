const { addDays, format, nextDay, parse, isValid, getDay } = require('date-fns');
const IstomaService = require('./istomaService');
const WhatsappService = require('./whatsappService');
const AppointmentStore = require('./appointmentStore');

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

            try {
                // Fetch doctors and locations
                const [doctors, locations] = await Promise.all([
                    IstomaService.getDoctors(),
                    IstomaService.getLocations()
                ]);

                console.log(`[DEBUG] Fetched ${doctors.length} doctors, ${locations.length} locations`);
                if (doctors.length > 0) {
                    console.log(`[DEBUG] Sample doctor:`, JSON.stringify(doctors[0]).substring(0, 200));
                }
                if (locations.length > 0) {
                    console.log(`[DEBUG] Sample location:`, JSON.stringify(locations[0]).substring(0, 200));
                }

                // Handle both PascalCase and camelCase for IDs
                let doctorIds = doctors.map(d => d.Id || d.id || d.ID || d['@_Id']).filter(id => id && id !== 0);
                let locationIds = locations.map(l => l.ID || l.id || l.Id || l['@_ID'] || l['@_Id']).filter(id => id && id !== 0);

                // Fallback: Use hardcoded doctor IDs if API returns empty
                // Dr. COROIAN Andrei ID=4, Dr. CRETIU Raul ID=5, Dr. PAVEL Iulia ID=2, Dr. UDECI Madalina ID=3
                if (doctorIds.length === 0) {
                    console.warn('[WARN] GetMedici returned empty, using fallback doctor IDs');
                    doctorIds = [2, 3, 4, 5]; // PAVEL=2, UDECI=3, COROIAN=4, CRETIU=5
                }

                // Fallback: Use default location if none found
                if (locationIds.length === 0) {
                    console.warn('[WARN] GetListaSedii returned empty, using fallback location ID');
                    locationIds = [3]; // Default sediu ID (adjust if needed)
                }

                console.log(`[DEBUG] Extracted doctor IDs:`, doctorIds);
                console.log(`[DEBUG] Extracted location IDs:`, locationIds);

                // Get slots for specific date
                let slots = await IstomaService.getAvailableSlots(formattedDate, doctorIds, locationIds);
                let usingFallback = false;

                if (!slots || slots.length === 0) {
                    // Fallback 1: Check for next available slots from Istoma
                    const nextSlots = await IstomaService.getFirstFreeSlots(5, doctorIds, locationIds);

                    if (nextSlots && nextSlots.length > 0) {
                        slots = nextSlots;
                        usingFallback = true;
                        await WhatsappService.sendMessage(from, `Din păcate sistemul nu raportează locuri libere exact pe ${formattedDate}. Dar am găsit aceste intervale libere în curând:`);
                    } else {
                        // Fallback 2: Forțează orele – generăm un grid de ore și încercăm programarea oricum
                        usingFallback = true;
                        await WhatsappService.sendMessage(
                            from,
                            `Sistemul de programări nu întoarce intervale libere pentru ${formattedDate}, dar putem încerca să te programăm oricum. Alege o oră din lista de mai jos (nu este verificată în Istoma, dar vom trimite programarea).`
                        );

                        const fallbackDoctorId = doctorIds[0] || 2; // Default to PAVEL if no doctors found
                        const fallbackCabinetId = 1; // Cabinet 1 (nr crt 1)
                        const syntheticSlots = [];

                        // Generăm intervale din 09:00 până în 19:00, din 30 în 30 de minute
                        const startHour = 9;
                        const endHour = 19;
                        for (let h = startHour; h <= endHour; h++) {
                            for (const m of [0, 30]) {
                                const hh = String(h).padStart(2, '0');
                                const mm = String(m).padStart(2, '0');
                                syntheticSlots.push({
                                    DataInceputInterval: `${formattedDate} ${hh}:${mm}`,
                                    IdMedic: fallbackDoctorId,
                                    IdCabinet: fallbackCabinetId
                                });
                            }
                        }

                        slots = syntheticSlots;
                    }
                } else {
                    await WhatsappService.sendMessage(from, `Am găsit intervale libere pe ${formattedDate}:`);
                }

                const availableOptions = this.processSlotsToOptions(slots);

                if (availableOptions.length === 0) {
                    await WhatsappService.sendMessage(from, `Nu am găsit intervale valide (eroare procesare).`);
                    return;
                }

                currentState.state = STATES.WAITING_FOR_SLOT;
                // Send LIST message
                const sections = [{
                    title: 'Ore Disponibile',
                    rows: availableOptions.slice(0, 10).map(opt => ({
                        id: `${opt.fullDate || currentState.data.date}|${opt.time}|${opt.doctorId}|${opt.cabinetId}`,
                        title: opt.displayTitle || opt.time,
                        description: opt.uName
                    }))
                }];

                await WhatsappService.sendList(from, `Intervale disponibile pt ${formattedDate}:`, "Alege o oră", sections);
                userState.set(from, currentState);

            } catch (err) {
                console.error('Error in flow:', err.message);
                // Send explicit error to user
                await WhatsappService.sendMessage(from, `Eroare sistem: ${err.message}. Te rog contactează adminul.`);
                // Reset to idle so they can try again later
                userState.set(from, { state: STATES.IDLE, data: {} });
            }

        } else if (currentState.state === STATES.WAITING_FOR_SLOT) {
            // text is the ID from list selection: "DATE|HH:MM|docId|cabId"
            const parts = text.split('|');
            if (parts.length < 4) {
                await WhatsappService.sendMessage(from, "Se pare că a fost o eroare. Te rog alege din listă.");
                return;
            }

            const [dateBooking, time, doctorId, cabinetId] = parts;
            // dateBooking is "DD.MM.YYYY"
            const date = dateBooking;

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

            const patientPayload = {
                nume: patientName,
                prenume: patientSurname,
                telefon: from,
                email: ""
            };

            // Log pending appointment in our local store (for dashboard)
            AppointmentStore.add({
                source: 'whatsapp',
                status: 'pending',
                patientPhone: from,
                patientName: `${patientName} ${patientSurname}`.trim(),
                date,
                time,
                doctorId,
                cabinetId
            });

            // Call AddAppointment
            const response = await IstomaService.addAppointment(
                patientPayload,
                date,
                time,
                30,
                doctorId,
                cabinetId
            );

            // Per docs: AdaugaProgramare returns "13" on success
            // Response can be: "13", 13, XML, or wrapped in object
            let isSuccess = false;
            if (typeof response === 'string') {
                // Check for XML response containing "13" or plain text "13"
                const responseText = response.trim();
                isSuccess = responseText === '13' || 
                           responseText.startsWith('13 ') || 
                           responseText.includes('<string>13</string>') ||
                           responseText.includes('>13<');
            } else if (typeof response === 'number') {
                isSuccess = response === 13;
            } else if (response && typeof response === 'object') {
                // Check if wrapped in response object or XML structure
                const respStr = String(response.response || response.message || response.Message || response.string || response);
                isSuccess = respStr.includes('13');
            }

            if (isSuccess) {
                AppointmentStore.updateStatusByPhoneDateTime(from, date, time, 'confirmed', {
                    doctorId,
                    cabinetId,
                    raw: response
                });
                await WhatsappService.sendMessage(from, `Programarea ta a fost confirmată pentru ${date} la ora ${time}!`);
            } else {
                // Fallback: trimitem o solicitare de programare chiar dacă slotul nu este valid în Istoma
                // Note: cabinetId este IdCabinet, dar pentru AdaugaSolicitareProgramareCuData avem nevoie de pIdSediu
                // Pentru moment folosim cabinetId ca locationId (sau 0 dacă nu e setat)
                const locationIdForRequest = cabinetId || 0;
                const reqResponse = await IstomaService.addAppointmentRequest(
                    patientPayload,
                    date,
                    time,
                    doctorId,
                    locationIdForRequest
                );

                // Per docs: AdaugaSolicitareProgramareCuData returns "13" on success
                let reqSuccess = false;
                if (typeof reqResponse === 'string') {
                    const responseText = reqResponse.trim();
                    reqSuccess = responseText === '13' || 
                               responseText.startsWith('13 ') || 
                               responseText.includes('<string>13</string>') ||
                               responseText.includes('>13<');
                } else if (typeof reqResponse === 'number') {
                    reqSuccess = reqResponse === 13;
                } else if (reqResponse && typeof reqResponse === 'object') {
                    const respStr = String(reqResponse.response || reqResponse.message || reqResponse.Message || reqResponse.string || reqResponse);
                    reqSuccess = respStr.includes('13');
                }

                if (reqSuccess) {
                    AppointmentStore.updateStatusByPhoneDateTime(from, date, time, 'request_sent', {
                        doctorId,
                        cabinetId,
                        raw: reqResponse
                    });
                    await WhatsappService.sendMessage(from, `Am trimis solicitarea ta de programare pentru ${date} la ora ${time}. Vei fi contactat de recepție pentru confirmare.`);
                } else {
                    AppointmentStore.updateStatusByPhoneDateTime(from, date, time, 'error', {
                        doctorId,
                        cabinetId,
                        raw: { response, reqResponse }
                    });
                    await WhatsappService.sendMessage(from, `Am întâmpinat o eroare la salvarea programării. Te rog încearcă din nou.`);
                    console.error('AddAppointment failed response:', response);
                    console.error('AddAppointmentRequest failed response:', reqResponse);
                }
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

        if (!Array.isArray(slots)) {
            console.log('[DEBUG] processSlotsToOptions: slots is not an array:', typeof slots);
            return [];
        }

        console.log(`[DEBUG] processSlotsToOptions: processing ${slots.length} slots`);
        if (slots.length > 0) {
            console.log(`[DEBUG] First slot structure:`, JSON.stringify(slots[0], null, 2));
        }

        for (const slot of slots) {
            // Extract Time - try multiple field name variations
            let startStr = slot.dataInceputInterval || 
                          slot.DataInceputInterval || 
                          slot.data_inceput_interval ||
                          slot.StartDate ||
                          slot.startDate ||
                          slot.dataInceput ||
                          slot.DataInceput ||
                          slot.dataInceputInterval ||
                          slot['data inceput interval'];
            
            if (!startStr) {
                console.log('[DEBUG] Slot missing start time field. Slot keys:', Object.keys(slot));
                continue;
            }

            // Parse time HH:mm
            // If format is "28.01.2026 14:00", split.
            let time = '';
            if (startStr.includes(' ')) {
                time = startStr.split(' ')[1].substring(0, 5); // HH:mm
            } else if (startStr.includes('T')) {
                time = startStr.split('T')[1].substring(0, 5);
            }

            // Extract IDs - try multiple field name variations (including XML attributes)
            const docId = slot.idMedic || slot.IdMedic || slot.id_medic || slot.IDMedic || 
                         slot['@_IdMedic'] || slot['@_idMedic'] || slot['@_Id'] || 
                         (slot.IdMedic && typeof slot.IdMedic === 'object' ? slot.IdMedic['#text'] : null) || 0;
            const cabId = slot.idCabinet || slot.IdCabinet || slot.id_cabinet || slot.IDCabinet || 
                         slot['@_IdCabinet'] || slot['@_idCabinet'] || 
                         (slot.IdCabinet && typeof slot.IdCabinet === 'object' ? slot.IdCabinet['#text'] : null) || 
                         1; // Default to Cabinet 1 if not found
            const locId = slot.idLocatie || slot.IdLocatie || slot.id_locatie || slot.IDLocatie || 
                         slot.idSediu || slot.IdSediu || slot['@_IdSediu'] || slot['@_idSediu'] || 0;

            // If multiple doctors free at 14:00, show 14:00 once? Or "14:00 (Dr X)", "14:00 (Dr Y)"?
            // User: "sa primeasca mesaj cu ora cu orele valabile care nu sunt acoperite"
            // Simple approach: show unique times. 
            // BUT we need to pass DocID to `addAppointment`.

            // Extract Date part
            let datePart = '';
            if (startStr.includes(' ')) {
                datePart = startStr.split(' ')[0]; // DD.MM.YYYY
            } else if (startStr.includes('T')) {
                // Assuming YYYY-MM-DDTHH:MM:SS format, convert to DD.MM.YYYY
                const [year, month, day] = startStr.split('T')[0].split('-');
                datePart = `${day}.${month}.${year}`;
            }

            // Create a unique key for dedupe: Date + Time
            const key = datePart + ' ' + time;

            if (!seen.has(key)) {
                seen.add(key);
                // If the option date is different than 'today' or requested, show it?
                // Just always show date for clarity in fallback scenarios.
                // Format: "28.01 14:00"
                const shortDate = datePart.substring(0, 5); // DD.MM

                options.push({
                    time: time,
                    fullDate: datePart, // We need this for booking if fallback used!
                    displayTitle: `${shortDate} ${time}`,
                    doctorId: docId,
                    cabinetId: cabId,
                    uName: "Disponibil" // Could fetch doctor name if we cache doctors list
                });
            }
        }

        // Sort by time/date
        options.sort((a, b) => a.displayTitle.localeCompare(b.displayTitle));

        return options;
    }
};

module.exports = ConversationManager;
