const axios = require('axios');
const querystring = require('querystring');
const { XMLParser } = require('fast-xml-parser');
require('dotenv').config();

const BASE_URL = process.env.ISTOMA_BASE_URL;
const API_KEY = process.env.ISTOMA_KEY;

// XML Parser configuration
const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: true,
    trimValues: true,
    ignoreNameSpace: false,
    parseTrueNumberOnly: false
});

// Create separate clients for GET (no Content-Type header) and POST (with Content-Type)
const apiClient = axios.create({
    baseURL: BASE_URL,
    // Istoma returns XML, so we need to parse it manually
    responseType: 'text'
});

// For POST requests, we'll set Content-Type in the request itself

// Helper to format params
const formatParams = (params) => {
    return { pCheie: API_KEY, ...params }; // Return object for axios params
};

// Helper to parse XML or JSON response from Istoma
const parseResponse = (rawData) => {
    if (!rawData || typeof rawData !== 'string' || !rawData.trim()) {
        return null;
    }

    // Try XML first (Istoma returns XML)
    if (rawData.trim().startsWith('<')) {
        try {
            const parsed = xmlParser.parse(rawData);
            console.log('[DEBUG] Parsed XML response');
            return parsed;
        } catch (e) {
            console.warn('[WARN] Failed to parse XML:', e.message);
        }
    }

    // Try JSON as fallback
    try {
        const parsed = JSON.parse(rawData);
        console.log('[DEBUG] Parsed JSON response');
        return parsed;
    } catch (e) {
        console.warn('[WARN] Response is neither valid XML nor JSON');
        return null;
    }
};

// Helper to extract array from Istoma response (handles various wrapper structures)
const extractArrayFromResponse = (responseData) => {
    if (responseData === '' || responseData === undefined || responseData === null) {
        console.log('[DEBUG] Response data is null/empty/undefined');
        return [];
    }

    // If we got a string, parse it (XML or JSON)
    if (typeof responseData === 'string') {
        if (!responseData.trim()) {
            console.log('[DEBUG] Response data is empty string');
            return [];
        }
        
        // Check for XML nil attribute (i:nil="true")
        if (responseData.includes('i:nil="true"') || responseData.includes('i:nil=\'true\'')) {
            console.log('[DEBUG] XML response indicates null/empty (i:nil="true")');
            return [];
        }
        
        const parsed = parseResponse(responseData);
        if (!parsed) {
            return [];
        }
        responseData = parsed;
    }

    // Direct array
    if (Array.isArray(responseData)) {
        console.log(`[DEBUG] Response is direct array with ${responseData.length} items`);
        return responseData;
    }
    
    // Check if it's an error response (from PHP example: decoded->response->status == 'ERROR')
    if (responseData.response) {
        if (responseData.response.status === 'ERROR') {
            console.error('[ERROR] Istoma API error:', responseData.response.errormessage);
            return [];
        }
        // If response exists but is not error, check if it contains data
        if (Array.isArray(responseData.response)) {
            console.log(`[DEBUG] Found array in response.response with ${responseData.response.length} items`);
            return responseData.response;
        }
        if (responseData.response.data && Array.isArray(responseData.response.data)) {
            console.log(`[DEBUG] Found array in response.response.data with ${responseData.response.data.length} items`);
            return responseData.response.data;
        }
        if (responseData.response.lista && Array.isArray(responseData.response.lista)) {
            console.log(`[DEBUG] Found array in response.response.lista with ${responseData.response.lista.length} items`);
            return responseData.response.lista;
        }
    }
    
    // Wrapped in common properties
    if (responseData.lista && Array.isArray(responseData.lista)) {
        console.log(`[DEBUG] Found array in lista with ${responseData.lista.length} items`);
        return responseData.lista;
    }
    
    if (responseData.data && Array.isArray(responseData.data)) {
        console.log(`[DEBUG] Found array in data with ${responseData.data.length} items`);
        return responseData.data;
    }
    
    if (responseData.result && Array.isArray(responseData.result)) {
        console.log(`[DEBUG] Found array in result with ${responseData.result.length} items`);
        return responseData.result;
    }
    
    // Log full structure for debugging
    console.warn('[WARN] Could not extract array from Istoma response. Full structure:', JSON.stringify(responseData, null, 2).substring(0, 1000));
    return [];
};

const IstomaService = {
    async getDoctors() {
        const response = await apiClient.get('GetMedici', { params: formatParams({}) });
        // Response is XML: <ArrayOfMedicAPIModel><MedicAPIModel>...</MedicAPIModel></ArrayOfMedicAPIModel>
        const parsed = parseResponse(response.data);
        if (!parsed) return [];
        
        // XML structure: ArrayOfMedicAPIModel.MedicAPIModel
        // Try exact key first, then search
        let data = null;
        if (parsed.ArrayOfMedicAPIModel) {
            data = parsed.ArrayOfMedicAPIModel.MedicAPIModel || parsed.ArrayOfMedicAPIModel;
        } else {
            const arrayKey = Object.keys(parsed).find(k => k.toLowerCase().includes('medic') || k.toLowerCase().includes('array'));
            if (arrayKey) {
                const container = parsed[arrayKey];
                data = container.MedicAPIModel || container;
            }
        }
        
        if (!data) return [];
        
        // If it's an array, return it; if single object, wrap in array
        return Array.isArray(data) ? data : [data];
    },

    async getLocations() {
        const response = await apiClient.get('GetListaSedii', { params: formatParams({}) });
        // Response is XML: <ArrayOfSediuAPIModel>...</ArrayOfSediuAPIModel>
        const parsed = parseResponse(response.data);
        if (!parsed) return [];
        
        const arrayKey = Object.keys(parsed).find(k => k.toLowerCase().includes('sediu') || k.toLowerCase().includes('array'));
        if (!arrayKey) return [];
        
        const data = parsed[arrayKey];
        if (!data) return [];
        
        return Array.isArray(data) ? data : [data];
    },

    async checkPatient(phone) {
        // VerificaPacient returns XML: <ArrayOfPacientAPIModel>...</ArrayOfPacientAPIModel>
        const response = await apiClient.get('VerificaPacient', {
            params: formatParams({
                pTelefon: phone,
                pAdresaMail: '',
                pIdPacient: '0' // String per docs
            })
        });
        
        const parsed = parseResponse(response.data);
        if (!parsed) {
            return { lista: [] };
        }
        
        // XML structure: ArrayOfPacientAPIModel.PacientAPIModel
        const arrayKey = Object.keys(parsed).find(k => k.toLowerCase().includes('pacient') || k.toLowerCase().includes('array'));
        if (!arrayKey) {
            return { lista: [] };
        }
        
        const data = parsed[arrayKey];
        if (!data) {
            return { lista: [] };
        }
        
        const lista = Array.isArray(data) ? data : [data];
        return { lista };
    },

    async addPatient(patientData) {
        // AdaugaPacient returns "13 $#$ idPacientNou" on success per docs
        const params = {
            pCheie: API_KEY,
            pNume: patientData.nume || '',
            pPrenume: patientData.prenume || '',
            pTelefon: patientData.telefon || '',
            pAdresaMail: patientData.email || '',
            pCnp: patientData.cnp || '',
            pDataNastereDDMMYYYY: patientData.dataNastere || '01011990', // Format: ddMMyyyy
            pObservatii: patientData.observatii || 'WhatsApp Bot',
            pSex: patientData.sex || '0', // 0, 1, or 2
            pLimba: patientData.limba || '28', // 0 or 28-33
            pMedic: patientData.medic || '0',
            pMedicCoordonator: patientData.medicCoordonator || '0',
            pIdentitatePersoanaContact: patientData.identitatePersoanaContact || '',
            pTelefonPersoanaContact: patientData.telefonPersoanaContact || '',
            pIdRecomandant: patientData.idRecomandant || '0',
            pTelefonSecundar: patientData.telefonSecundar || '',
            pEmailSecundar: patientData.emailSecundar || '',
            pTelefonTertiar: patientData.telefonTertiar || '',
            pEmailTertiar: patientData.emailTertiar || '',
            pNotificaPrinWebhook: patientData.notificaPrinWebhook || '',
            pLinkFisaExtern: patientData.linkFisaExtern || '',
            pTipAct: patientData.tipAct || '0', // 0, 1, 2, or 3
            pSerieAct: patientData.serieAct || '',
            pNumarAct: patientData.numarAct || '',
            pIdCanalMarketing: patientData.idCanalMarketing || '0'
        };
        const formData = querystring.stringify(params);
        const response = await apiClient.post('AdaugaPacient', formData, {
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(formData)
            }
        });
        // Response: "13 $#$ idPacientNou" or "13" or error code (can be XML or plain text)
        return response.data;
    },

    async getAvailableSlots(date, doctorIds = [], locationIds = []) {
        // If no doctors specified, pass empty string (API will return all doctors per docs)
        const doctorIdsStr = doctorIds.length > 0 ? doctorIds.join(',') : '';
        const formattedDate = date.replace(/\./g, '');

        console.log(`[DEBUG] getAvailableSlots: date=${date}, formattedDate=${formattedDate}, doctorIds=${doctorIds.length}, locationIds=${locationIds.length}`);

        let allSlots = [];
        // If no locations specified, use 0 (all locations per docs)
        const locationsToCheck = locationIds.length > 0 ? locationIds : [0];

        for (const locId of locationsToCheck) {
            const params = {
                pDataInceputZZLLAAAA: formattedDate,
                pDataSfarsitZZLLAAAA: formattedDate,
                // API-ul așteaptă ora fără sufix ":00" (ex: "08", nu "08:00")
                pOraInceput: '08',
                pOraFinal: '21',
                pListaIdMedici: doctorIdsStr || '', // Empty string means all doctors
                pIdSediu: locId
            };

            // We want to skip loop iteration on some specific errors? 
            // Better to fail one checking than fail all if one location is weird.
            // But if AUTH fails, all fail.
            // Let's keep the inner try/catch ONLY for location-specific non-critical errors if possible,
            // BUT for now, let's propagate EVERYTHING so we see the error.
            let response;
            try {
                // Log the full URL being called
                const fullUrl = `${BASE_URL}GetListaIntervaleActivitate?${new URLSearchParams(formatParams(params)).toString()}`;
                console.log(`[DEBUG] Calling GetListaIntervaleActivitate URL:`, fullUrl.substring(0, 200));
                
                response = await apiClient.get('GetListaIntervaleActivitate', { 
                    params: formatParams(params)
                });
            } catch (error) {
                console.error(`[ERROR] GetListaIntervaleActivitate failed for location ${locId}:`, error.message);
                console.error(`[ERROR] Error response:`, error.response?.data);
                console.error(`[ERROR] Error status:`, error.response?.status);
                continue; // Skip this location and try next
            }
            console.log(`[DEBUG] GetListaIntervaleActivitate called for date ${date}, location ${locId}, doctors: ${doctorIdsStr}`);
            console.log(`[DEBUG] Response status:`, response.status, response.statusText);
            console.log(`[DEBUG] Response data (first 500 chars):`, response.data?.substring(0, 500));
            
            // Parse response (can be XML or JSON)
            const parsed = parseResponse(response.data);
            if (!parsed) {
                console.log(`[INFO] No slots available for location ${locId}`);
                continue;
            }
            
            // Handle both JSON array (direct) and XML structure
            let slots = [];
            if (Array.isArray(parsed)) {
                // Direct JSON array
                slots = parsed;
            } else {
                // XML structure: ArrayOfIntervalCabinetAPIModel.IntervalCabinetAPIModel
                const arrayKey = Object.keys(parsed).find(k => k.toLowerCase().includes('interval') || k.toLowerCase().includes('array'));
                if (arrayKey) {
                    const data = parsed[arrayKey];
                    if (data) {
                        slots = Array.isArray(data) ? data : [data];
                    }
                }
            }
            
            if (slots.length === 0) {
                console.log(`[INFO] No interval slots found in response for location ${locId}`);
                continue;
            }
            console.log(`[DEBUG] Extracted ${slots.length} slots from GetListaIntervaleActivitate`);
            if (slots.length > 0) {
                console.log(`[DEBUG] First slot sample:`, JSON.stringify(slots[0]).substring(0, 200));
                allSlots = allSlots.concat(slots);
            }
        }
        return allSlots;
    },

    async getFirstFreeSlots(count = 5, doctorIds = [], locationIds = []) {
        // If no doctors specified, pass empty string (API will return all doctors per docs)
        const doctorIdsStr = doctorIds.length > 0 ? doctorIds.join(',') : '';
        let allSlots = [];
        // If no locations specified, use 0 (all locations per docs)
        const locationsToCheck = locationIds.length > 0 ? locationIds : [0];

        console.log(`[DEBUG] getFirstFreeSlots: count=${count}, doctorIds=${doctorIds.length}, locationIds=${locationIds.length}`);

        for (const locId of locationsToCheck) {
            const params = {
                pNrSloturiReturnate: count,
                pOraInceput: '08:00',
                pOraFinal: '20:00',
                pListaIdMedici: doctorIdsStr || '', // Empty string means all doctors
                pIdSediu: locId,
                pIdCategorie: '0' // Per docs, should be string
            };

            // Propagate errors
            let response;
            try {
                // Log the full URL being called
                const fullUrl = `${BASE_URL}GetPrimeleSloturiLibere?${new URLSearchParams(formatParams(params)).toString()}`;
                console.log(`[DEBUG] Calling GetPrimeleSloturiLibere URL:`, fullUrl.substring(0, 200));
                
                response = await apiClient.get('GetPrimeleSloturiLibere', { 
                    params: formatParams(params)
                });
            } catch (error) {
                console.error(`[ERROR] GetPrimeleSloturiLibere failed for location ${locId}:`, error.message);
                console.error(`[ERROR] Error response:`, error.response?.data);
                console.error(`[ERROR] Error status:`, error.response?.status);
                continue; // Skip this location and try next
            }
            console.log(`[DEBUG] GetPrimeleSloturiLibere called for location ${locId}, doctors: ${doctorIdsStr}, count: ${count}`);
            console.log(`[DEBUG] Response status:`, response.status, response.statusText);
            console.log(`[DEBUG] Response data (first 500 chars):`, response.data?.substring(0, 500));
            
            // Parse response (can be XML or JSON)
            const parsed = parseResponse(response.data);
            if (!parsed) {
                console.log(`[INFO] No slots available for location ${locId}`);
                continue;
            }
            
            // Handle both JSON array (direct) and XML structure
            let slots = [];
            if (Array.isArray(parsed)) {
                // Direct JSON array
                slots = parsed;
            } else {
                // XML structure: ArrayOfIntervalCabinetAPIModel.IntervalCabinetAPIModel
                const arrayKey = Object.keys(parsed).find(k => k.toLowerCase().includes('interval') || k.toLowerCase().includes('array'));
                if (arrayKey) {
                    const data = parsed[arrayKey];
                    if (data) {
                        slots = Array.isArray(data) ? data : [data];
                    }
                }
            }
            
            if (slots.length === 0) {
                console.log(`[INFO] No interval slots found in response for location ${locId}`);
                continue;
            }
            console.log(`[DEBUG] Extracted ${slots.length} slots from GetPrimeleSloturiLibere`);
            if (slots.length > 0) {
                console.log(`[DEBUG] First slot sample:`, JSON.stringify(slots[0]).substring(0, 200));
                allSlots = allSlots.concat(slots);
            }
        }
        return allSlots;
    },

    async addAppointment(patientData, date, time, duration = 30, doctorId, cabinetId = 0) {
        // Format: pDataDDMMYYYYHHMM = DDMMYYYYHHMM (no separators)
        // date is DD.MM.YYYY, time is HH:MM
        const dateTime = date.replace(/\./g, '') + time.replace(':', '');
        
        console.log(`[DEBUG] addAppointment: date=${date}, time=${time}, dateTime=${dateTime}, doctorId=${doctorId}, cabinetId=${cabinetId}`);

        const params = {
            pNumeCompletPacient: `${patientData.nume} ${patientData.prenume}`.trim(),
            pTelefonPacient: patientData.telefon,
            pAdresaMailPacient: patientData.email || '',
            pDataDDMMYYYYHHMM: dateTime, // Format: DDMMYYYYHHMM
            pDurataInMinute: String(duration), // String per docs
            pIdSpecialist: String(doctorId || '0'), // int per docs, but we'll send as string
            pIdCabinet: String(cabinetId || '0'), // string per docs
            pCategorie: patientData.categorie || 'Consultatie',
            pObservatii: patientData.observatii || 'Programat prin WhatsApp'
        };

        console.log(`[DEBUG] AdaugaProgramare params:`, JSON.stringify(params, null, 2));

        // POST with form data (not query params!)
        // Per docs, AdaugaProgramare expects POST with form-urlencoded body
        const formData = querystring.stringify(formatParams(params));
        
        console.log(`[DEBUG] AdaugaProgramare form data:`, formData);
        
        const response = await apiClient.post('AdaugaProgramare', formData, { 
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(formData)
            }
        });
        
        console.log(`[DEBUG] AdaugaProgramare response:`, response.data);
        // Response: "13" on success per docs (can be XML or plain text)
        return response.data;
    },

    // Fallback: send a scheduling REQUEST (AdaugaSolicitareProgramareCuData)
    // Per docs: AdaugaSolicitareProgramareCuData(string pCheie, string pDataDDMMYYYYHHMM, string pNumeComplet, string pTelefon, string pAdresaMail, string pObservatii, string pIdSursa, string pIdCampanie, string pIdSediu, string pCategorie, string pNumeMedic)
    async addAppointmentRequest(patientData, date, time, doctorId, locationId = 0, category = 'Consultatie', doctorName = '') {
        // Format: pDataDDMMYYYYHHMM = DDMMYYYYHHMM
        const dateTime = date.replace(/\./g, '') + time.replace(':', '');
        
        console.log(`[DEBUG] addAppointmentRequest: date=${date}, time=${time}, dateTime=${dateTime}, locationId=${locationId}`);

        const params = {
            pDataDDMMYYYYHHMM: dateTime, // Format: DDMMYYYYHHMM
            pNumeComplet: `${patientData.nume} ${patientData.prenume}`.trim(),
            pTelefon: patientData.telefon,
            pAdresaMail: patientData.email || '',
            pObservatii: patientData.observatii || 'Solicitare programare din WhatsApp',
            pIdSursa: String(patientData.idSursa || '0'), // string per docs
            pIdCampanie: String(patientData.idCampanie || '0'), // string per docs
            pIdSediu: String(locationId || '0'), // string per docs
            pCategorie: category || 'Consultatie',
            pNumeMedic: doctorName || '' // Optional: name of doctor if known
        };

        console.log(`[DEBUG] AdaugaSolicitareProgramareCuData params:`, JSON.stringify(params, null, 2));

        // POST with form data (not query params!)
        const formData = querystring.stringify(formatParams(params));
        
        console.log(`[DEBUG] AdaugaSolicitareProgramareCuData form data:`, formData);
        
        const response = await apiClient.post('AdaugaSolicitareProgramareCuData', formData, { 
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(formData)
            }
        });
        
        console.log(`[DEBUG] AdaugaSolicitareProgramareCuData response:`, response.data);
        // Response: "13" on success per docs (can be XML or plain text)
        return response.data;
    }
};

module.exports = IstomaService;
