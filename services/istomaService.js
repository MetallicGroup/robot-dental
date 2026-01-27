const axios = require('axios');
const querystring = require('querystring');
require('dotenv').config();

const BASE_URL = process.env.ISTOMA_BASE_URL;
const API_KEY = process.env.ISTOMA_KEY;

// Create separate clients for GET (no Content-Type header) and POST (with Content-Type)
const apiClient = axios.create({
    baseURL: BASE_URL,
    // Don't set Content-Type for GET requests - let axios handle it
    responseType: 'json'
});

// For POST requests, we'll set Content-Type in the request itself

// Helper to format params
const formatParams = (params) => {
    return { pCheie: API_KEY, ...params }; // Return object for axios params
};

// Helper to extract array from Istoma response (handles various wrapper structures)
const extractArrayFromResponse = (responseData) => {
    if (responseData === '' || responseData === undefined || responseData === null) {
        console.log('[DEBUG] Response data is null/empty/undefined');
        console.log('[DEBUG] Response data type:', typeof responseData);
        return [];
    }

    // If we got a string, try to parse JSON; otherwise, treat empty string as no data
    if (typeof responseData === 'string') {
        if (!responseData.trim()) {
            console.log('[DEBUG] Response data is empty string');
            return [];
        }
        try {
            const parsed = JSON.parse(responseData);
            responseData = parsed;
            console.log('[DEBUG] Parsed string response into JSON object');
        } catch (e) {
            console.warn('[WARN] Response is string but not valid JSON, returning empty array');
            return [];
        }
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
        return extractArrayFromResponse(response.data);
    },

    async getLocations() {
        const response = await apiClient.get('GetListaSedii', { params: formatParams({}) });
        return extractArrayFromResponse(response.data);
    },

    async checkPatient(phone) {
        // VerificaPacient returns { lista: [...] } per documentation
        const response = await apiClient.get('VerificaPacient', {
            params: formatParams({
                pTelefon: phone,
                pAdresaMail: '',
                pIdPacient: '0' // String per docs
            })
        });
        // Response structure: { lista: [...] } or { response: { lista: [...] } }
        let data = response.data;
        if (data && data.response && data.response.lista) {
            return { lista: data.response.lista };
        }
        if (data && data.lista) {
            return data;
        }
        // If not found, return empty lista
        return { lista: [] };
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
        const response = await apiClient.post('AdaugaPacient', querystring.stringify(params), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        // Response: "13 $#$ idPacientNou" or "13" or error code
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
                pOraInceput: '08:00',
                pOraFinal: '20:00',
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
                    params: formatParams(params),
                    responseType: 'text',           // capture raw text; we'll parse manually
                    transformResponse: x => x
                });
            } catch (error) {
                console.error(`[ERROR] GetListaIntervaleActivitate failed for location ${locId}:`, error.message);
                console.error(`[ERROR] Error response:`, error.response?.data);
                console.error(`[ERROR] Error status:`, error.response?.status);
                continue; // Skip this location and try next
            }
            console.log(`[DEBUG] GetListaIntervaleActivitate called for date ${date}, location ${locId}, doctors: ${doctorIdsStr}`);
            console.log(`[DEBUG] Response headers:`, JSON.stringify(response.headers, null, 2));
            console.log(`[DEBUG] Response status:`, response.status, response.statusText);
            console.log(`[DEBUG] Response data type:`, typeof response.data);
            console.log(`[DEBUG] Response data value:`, response.data);
            
            // If data is null, try to get raw response
            let responseData = response.data;
            // If data is a string, try to parse JSON
            if (typeof responseData === 'string') {
                if (!responseData.trim()) {
                    console.log('[DEBUG] response.data is empty string');
                } else {
                    try {
                        responseData = JSON.parse(responseData);
                        console.log('[DEBUG] Parsed response.data string to JSON');
                    } catch (e) {
                        console.log('[DEBUG] response.data is string but not JSON:', e.message);
                    }
                }
            }
            if (responseData === null || responseData === undefined) {
                console.log(`[WARN] Response data is null! Checking if response has other properties...`);
                console.log(`[DEBUG] Response keys:`, Object.keys(response));
                
                // Try to access raw response if available
                if (response.request && response.request.response) {
                    const rawResponse = response.request.response;
                    console.log(`[DEBUG] Raw response text:`, rawResponse.substring(0, 500));
                    
                    // Try to parse raw response as JSON
                    if (typeof rawResponse === 'string' && rawResponse.trim()) {
                        try {
                            responseData = JSON.parse(rawResponse);
                            console.log(`[DEBUG] Successfully parsed raw response as JSON`);
                        } catch (e) {
                            console.log(`[DEBUG] Raw response is not valid JSON:`, e.message);
                        }
                    }
                }
                
                // If still null, API might return null for empty results (which is valid)
                if (responseData === null || responseData === undefined) {
                    console.log(`[INFO] API returned null - likely no slots available (this is valid)`);
                    responseData = null; // Will be handled by extractArrayFromResponse
                }
            } else {
                console.log(`[DEBUG] Full response.data:`, JSON.stringify(responseData, null, 2).substring(0, 1000));
            }
            const slots = extractArrayFromResponse(responseData);
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
                    params: formatParams(params),
                    responseType: 'text',           // capture raw text; we'll parse manually
                    transformResponse: x => x
                });
            } catch (error) {
                console.error(`[ERROR] GetPrimeleSloturiLibere failed for location ${locId}:`, error.message);
                console.error(`[ERROR] Error response:`, error.response?.data);
                console.error(`[ERROR] Error status:`, error.response?.status);
                continue; // Skip this location and try next
            }
            console.log(`[DEBUG] GetPrimeleSloturiLibere called for location ${locId}, doctors: ${doctorIdsStr}, count: ${count}`);
            console.log(`[DEBUG] Response headers:`, JSON.stringify(response.headers, null, 2));
            console.log(`[DEBUG] Response status:`, response.status, response.statusText);
            console.log(`[DEBUG] Response data type:`, typeof response.data);
            console.log(`[DEBUG] Response data value:`, response.data);
            
            // If data is null, try to get raw response
            let responseData = response.data;
            // If data is a string, try to parse JSON
            if (typeof responseData === 'string') {
                if (!responseData.trim()) {
                    console.log('[DEBUG] response.data is empty string');
                } else {
                    try {
                        responseData = JSON.parse(responseData);
                        console.log('[DEBUG] Parsed response.data string to JSON');
                    } catch (e) {
                        console.log('[DEBUG] response.data is string but not JSON:', e.message);
                    }
                }
            }
            if (responseData === null || responseData === undefined) {
                console.log(`[WARN] Response data is null! Checking if response has other properties...`);
                console.log(`[DEBUG] Response keys:`, Object.keys(response));
                
                // Try to access raw response if available
                if (response.request && response.request.response) {
                    const rawResponse = response.request.response;
                    console.log(`[DEBUG] Raw response text:`, rawResponse.substring(0, 500));
                    
                    // Try to parse raw response as JSON
                    if (typeof rawResponse === 'string' && rawResponse.trim()) {
                        try {
                            responseData = JSON.parse(rawResponse);
                            console.log(`[DEBUG] Successfully parsed raw response as JSON`);
                        } catch (e) {
                            console.log(`[DEBUG] Raw response is not valid JSON:`, e.message);
                        }
                    }
                }
                
                // If still null, API might return null for empty results (which is valid)
                if (responseData === null || responseData === undefined) {
                    console.log(`[INFO] API returned null - likely no slots available (this is valid)`);
                    responseData = null; // Will be handled by extractArrayFromResponse
                }
            } else {
                console.log(`[DEBUG] Full response.data:`, JSON.stringify(responseData, null, 2).substring(0, 1000));
            }
            const slots = extractArrayFromResponse(responseData);
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

        // POST with params in URL (QueryString) and empty body
        const response = await apiClient.post('AdaugaProgramare', null, { 
            params: formatParams(params),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        
        console.log(`[DEBUG] AdaugaProgramare response:`, response.data);
        // Response: "13" on success per docs
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

        const response = await apiClient.post('AdaugaSolicitareProgramareCuData', null, { 
            params: formatParams(params),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        
        console.log(`[DEBUG] AdaugaSolicitareProgramareCuData response:`, response.data);
        // Response: "13" on success per docs
        return response.data;
    }
};

module.exports = IstomaService;
