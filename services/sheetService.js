const axios = require('axios');

const SHEET_ID = '1Ll2OGmBdNXoCilEChkEkV_t5p-dul62832eugmstRkI';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;

const SheetService = {
    async getLeads() {
        try {
            const response = await axios.get(CSV_URL);
            const csvText = response.data;
            return this.parseCsv(csvText);
        } catch (error) {
            console.error('Error fetching sheet:', error.message);
            return [];
        }
    },

    parseCsv(text) {
        const lines = text.split('\n');
        const leads = [];

        // Skip header if exists? 
        // User didn't specify header. The curl output showed:
        // ,
        // daniel,40733342513
        // So first line might be empty or header.
        // We will process all lines that have at least 2 columns and look valid.

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Simple comma split (assuming no commas in name for MVP)
            const parts = line.split(',');
            if (parts.length < 2) continue;

            const name = parts[0].trim();
            let rawPhone = parts[1].trim();

            // Normalize Phone
            // "indiferent de cum apare in sheet sa fie transmis in istoma corect"
            // Usually iStoma/WhatsApp needs 407xxxxxxxx

            const cleanPhone = this.normalizePhone(rawPhone);

            if (cleanPhone && name) {
                leads.push({ name, phone: cleanPhone, originalPhone: rawPhone });
            }
        }
        return leads;
    },

    normalizePhone(phone) {
        // Remove all non-digit chars
        let digits = phone.replace(/\D/g, '');

        // Check for RO patterns
        // If starts with 07... (10 digits) -> make it 407...
        if (digits.startsWith('07') && digits.length === 10) {
            return '4' + digits;
        }

        // If starts with 7... (9 digits) -> add 40
        if (digits.startsWith('7') && digits.length === 9) {
            return '40' + digits;
        }

        // If already 407... (11 digits) -> keep
        if (digits.startsWith('407') && digits.length === 11) {
            return digits;
        }

        // Fallback: return digits if it looks reasonable, or null?
        // Let's return digits if length > 5
        return digits.length > 5 ? digits : null;
    }
};

module.exports = SheetService;
