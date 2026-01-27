const axios = require('axios');
const querystring = require('querystring');
require('dotenv').config();

const BASE_URL = process.env.ISTOMA_BASE_URL;
const API_KEY = process.env.ISTOMA_KEY;

const apiClient = axios.create({
    baseURL: BASE_URL,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
});

// Helper to format params
const formatParams = (params) => {
    return { pCheie: API_KEY, ...params }; // Return object for axios params
};

// Helper to extract array from Istoma response (handles various wrapper structures)
const extractArrayFromResponse = (responseData) => {
    if (!responseData) return [];
    
    // Direct array
    if (Array.isArray(responseData)) {
        return responseData;
    }
    
    // Wrapped in common properties
    if (responseData.lista && Array.isArray(responseData.lista)) {
        return responseData.lista;
    }
    
    if (responseData.response && Array.isArray(responseData.response)) {
        return responseData.response;
    }
    
    if (responseData.data && Array.isArray(responseData.data)) {
        return responseData.data;
    }
    
    if (responseData.result && Array.isArray(responseData.result)) {
        return responseData.result;
    }
    
    // Log for debugging if we can't find the array
    console.warn('Could not extract array from Istoma response:', JSON.stringify(responseData).substring(0, 200));
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
        // This one can return null as "not found" vs "error", but for now let's bubble up to be safe?
        // Actually checkPatient returning null is a valid "not found" logic in some apps, 
        // BUT if it is a connection error, we want to know.
        // Let's propagate error for connection, but maybe handle 404? 
        // The API likely returns empty list for not found, not 404.
        const response = await apiClient.get('VerificaPacient', {
            params: formatParams({
                pTelefon: phone,
                pAdresaMail: '',
                pIdPacient: 0
            })
        });
        return response.data;
    },

    async addPatient(patientData) {
        const params = {
            pCheie: API_KEY,
            pNume: patientData.nume || '',
            pPrenume: patientData.prenume || '',
            pTelefon: patientData.telefon || '',
            pAdresaMail: patientData.email || '',
            pCnp: '',
            pDataNastereDDMMYYYY: '01011990',
            pObservatii: 'WhatsApp Bot',
            pSex: 0,
            pLimba: 28,
            pMedic: 0,
            pMedicCoordonator: 0,
            pIdentitatePersoanaContact: '',
            pTelefonPersoanaContact: '',
            pIdRecomandant: 0,
            pTelefonSecundar: '',
            pEmailSecundar: '',
            pTelefonTertiar: '',
            pEmailTertiar: '',
            pNotificaPrinWebhook: '',
            pLinkFisaExtern: '',
            pTipAct: 0,
            pSerieAct: '',
            pNumarAct: '',
            pIdCanalMarketing: 0
        };
        const response = await apiClient.post('AdaugaPacient', querystring.stringify(params));
        return response.data;
    },

    async getAvailableSlots(date, doctorIds = [], locationIds = []) {
        const doctorIdsStr = doctorIds.join(',');
        const formattedDate = date.replace(/\./g, '');

        let allSlots = [];
        const locationsToCheck = locationIds.length > 0 ? locationIds : [0];

        for (const locId of locationsToCheck) {
            const params = {
                pDataInceputZZLLAAAA: formattedDate,
                pDataSfarsitZZLLAAAA: formattedDate,
                pOraInceput: '08:00',
                pOraFinal: '20:00',
                pListaIdMedici: doctorIdsStr,
                pIdSediu: locId
            };

            // We want to skip loop iteration on some specific errors? 
            // Better to fail one checking than fail all if one location is weird.
            // But if AUTH fails, all fail.
            // Let's keep the inner try/catch ONLY for location-specific non-critical errors if possible,
            // BUT for now, let's propagate EVERYTHING so we see the error.
            const response = await apiClient.get('GetListaIntervaleActivitate', { params: formatParams(params) });
            // Debug: log response structure if no slots found
            if (!response.data || (!Array.isArray(response.data) && !response.data.lista)) {
                console.log(`[DEBUG GetListaIntervaleActivitate] Response structure for date ${date}, location ${locId}:`, 
                    JSON.stringify(response.data).substring(0, 500));
            }
            const slots = extractArrayFromResponse(response.data);
            if (slots.length > 0) {
                allSlots = allSlots.concat(slots);
            }
        }
        return allSlots;
    },

    async getFirstFreeSlots(count = 5, doctorIds = [], locationIds = []) {
        const doctorIdsStr = doctorIds.join(',');
        let allSlots = [];
        const locationsToCheck = locationIds.length > 0 ? locationIds : [0];

        for (const locId of locationsToCheck) {
            const params = {
                pNrSloturiReturnate: count,
                pOraInceput: '08:00',
                pOraFinal: '20:00',
                pListaIdMedici: doctorIdsStr,
                pIdSediu: locId,
                pIdCategorie: 0
            };

            // Propagate errors
            const response = await apiClient.get('GetPrimeleSloturiLibere', { params: formatParams(params) });
            // Debug: log response structure if no slots found
            if (!response.data || (!Array.isArray(response.data) && !response.data.lista)) {
                console.log(`[DEBUG GetPrimeleSloturiLibere] Response structure for location ${locId}:`, 
                    JSON.stringify(response.data).substring(0, 500));
            }
            const slots = extractArrayFromResponse(response.data);
            if (slots.length > 0) {
                allSlots = allSlots.concat(slots);
            }
        }
        return allSlots;
    },

    async addAppointment(patientData, date, time, duration = 30, doctorId, cabinetId = 0) {
        const dateTime = date.replace(/\./g, '') + time.replace(':', '');

        const params = {
            pNumeCompletPacient: `${patientData.nume} ${patientData.prenume}`,
            pTelefonPacient: patientData.telefon,
            pAdresaMailPacient: patientData.email || '',
            pDataDDMMYYYYHHMM: dateTime,
            pDurataInMinute: duration,
            pIdSpecialist: doctorId,
            pIdCabinet: cabinetId,
            pCategorie: 'Consultatie',
            pObservatii: 'Programat prin WhatsApp'
        };

        // POST with params in URL (QueryString) and empty body
        const response = await apiClient.post('AdaugaProgramare', null, { params: formatParams(params) });
        return response.data;
    }
};

module.exports = IstomaService;
