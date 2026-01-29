const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'appointments.json');

let loaded = false;
let appointments = [];

function ensureLoaded() {
    if (loaded) return;
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        appointments = JSON.parse(raw);
    } catch (_) {
        appointments = [];
    }
    loaded = true;
}

function persist() {
    try {
        const dir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(appointments, null, 2), 'utf8');
    } catch (err) {
        console.error('Error persisting appointments:', err.message);
    }
}

function nextId() {
    ensureLoaded();
    const maxId = appointments.reduce((max, a) => Math.max(max, a.id || 0), 0);
    return maxId + 1;
}

const AppointmentStore = {
    getAll() {
        ensureLoaded();
        // sort by dateTime desc
        return [...appointments].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    },

    add(appointment) {
        ensureLoaded();
        const now = new Date().toISOString();
        const record = {
            id: nextId(),
            createdAt: now,
            source: appointment.source || 'whatsapp',
            status: appointment.status || 'pending',
            patientPhone: appointment.patientPhone,
            patientName: appointment.patientName || '',
            date: appointment.date,
            time: appointment.time,
            notes: appointment.notes || '',
            doctorId: appointment.doctorId || null,
            cabinetId: appointment.cabinetId || null,
            raw: appointment.raw || null
        };
        appointments.push(record);
        persist();
        return record;
    },

    updateStatusByPhoneDateTime(phone, date, time, status, extra = {}) {
        ensureLoaded();
        const idx = appointments.findIndex(
            a => a.patientPhone === phone && a.date === date && a.time === time
        );
        if (idx === -1) {
            // If not found, add a new one with given status
            return this.add({
                source: 'whatsapp',
                status,
                patientPhone: phone,
                patientName: extra.patientName || '',
                date,
                time,
                doctorId: extra.doctorId,
                cabinetId: extra.cabinetId,
                raw: extra.raw
            });
        }
        appointments[idx] = {
            ...appointments[idx],
            status,
            ...extra,
            updatedAt: new Date().toISOString()
        };
        persist();
        return appointments[idx];
    },

    // Găsește programarea activă (confirmată) pentru un client
    findActiveAppointment(phone) {
        ensureLoaded();
        // Găsește programarea cea mai recentă confirmată pentru acest client
        const activeAppointments = appointments
            .filter(a => a.patientPhone === phone && a.status === 'confirmed')
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        
        return activeAppointments.length > 0 ? activeAppointments[0] : null;
    },

    // Marchează programarea ca anulată
    cancelAppointment(phone, date, time) {
        ensureLoaded();
        const idx = appointments.findIndex(
            a => a.patientPhone === phone && a.date === date && a.time === time && a.status === 'confirmed'
        );
        if (idx !== -1) {
            appointments[idx] = {
                ...appointments[idx],
                status: 'cancelled',
                cancelledAt: new Date().toISOString()
            };
            persist();
            return appointments[idx];
        }
        return null;
    }
};

module.exports = AppointmentStore;

