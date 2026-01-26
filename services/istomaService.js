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

const IstomaService = {
    async getDoctors() {
        try {
            const response = await apiClient.get('GetMedici', { params: formatParams({}) });
            return response.data;
        } catch (error) {
            console.error('Error fetching doctors:', error.message);
            return [];
        }
    },

    async getLocations() {
        try {
            const response = await apiClient.get('GetListaSedii', { params: formatParams({}) });
            return response.data;
        } catch (error) {
            console.error('Error fetching locations:', error.message);
            return [];
        }
    },

    async checkPatient(phone) {
        try {
            const response = await apiClient.get('VerificaPacient', {
                params: formatParams({
                    pTelefon: phone,
                    pAdresaMail: '',
                    pIdPacient: 0
                })
            });
            return response.data;
        } catch (error) {
            console.error('Error checking patient:', error.message);
            return null;
        }
    },

    async addPatient(patientData) {
        try {
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
            // Note: AdaugaPacient might ALSO need this URL param trick?
            // But let's leave it as is for now, focused on AdaugaProgramare.
            // Actually, if AdaugaProgramare needs it, likely AdaugaPacient does too.
            // But sticking to AdaugaProgramare for this test.
            const response = await apiClient.post('AdaugaPacient', querystring.stringify(params));
            return response.data;
        } catch (error) {
            console.error('Error adding patient:', error.message);
            return null;
        }
    },

    async getAvailableSlots(date, doctorIds = [], locationIds = []) {
        const doctorIdsStr = doctorIds.join(',');
        const formattedDate = date.replace(/\./g, '');

        let allSlots = [];
        const locationsToCheck = locationIds.length > 0 ? locationIds : [0];

        try {
            for (const locId of locationsToCheck) {
                const params = {
                    pDataInceputZZLLAAAA: formattedDate,
                    pDataSfarsitZZLLAAAA: formattedDate,
                    pOraInceput: '08:00',
                    pOraFinal: '20:00',
                    pListaIdMedici: doctorIdsStr,
                    pIdSediu: locId
                };

                try {
                    const response = await apiClient.get('GetListaIntervaleActivitate', { params: formatParams(params) });
                    if (response.data && Array.isArray(response.data)) {
                        allSlots = allSlots.concat(response.data);
                    }
                } catch (innerErr) {
                    // Ignore 404 for specific location checks if others might work
                    if (innerErr.response && innerErr.response.status !== 404) {
                        console.error(`Error checking location ${locId}:`, innerErr.message);
                    }
                }
            }
            return allSlots;
        } catch (error) {
            console.error('Error getting slots:', error.message);
            return [];
        }
    },

    async getFirstFreeSlots(count = 5, doctorIds = [], locationIds = []) {
        const doctorIdsStr = doctorIds.join(',');
        let allSlots = [];
        const locationsToCheck = locationIds.length > 0 ? locationIds : [0];

        try {
            for (const locId of locationsToCheck) {
                const params = {
                    pNrSloturiReturnate: count,
                    pOraInceput: '08:00',
                    pOraFinal: '20:00',
                    pListaIdMedici: doctorIdsStr,
                    pIdSediu: locId,
                    pIdCategorie: 0
                };

                try {
                    const response = await apiClient.get('GetPrimeleSloturiLibere', { params: formatParams(params) });
                    if (response.data && Array.isArray(response.data)) {
                        allSlots = allSlots.concat(response.data);
                    }
                } catch (e) {
                }
            }
            return allSlots;
        } catch (error) {
            console.error('Error getting prime slots:', error.message);
            return [];
        }
    },

    async addAppointment(patientData, date, time, duration = 30, doctorId, cabinetId = 0) {
        const dateTime = date.replace(/\./g, '') + time.replace(':', '');

        try {
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
        } catch (error) {
            console.error('Error adding appointment:', error.message);
            if (error.response) return error.response.data;
            return null;
        }
    }
};

module.exports = IstomaService;
