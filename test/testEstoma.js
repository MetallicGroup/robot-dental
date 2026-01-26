const IstomaService = require('../services/istomaService');

async function testFullFlow() {
    console.log('--- STARTING COMPREHENSIVE TEST ---');

    // 1. Get Doctors
    console.log('[1] Fetching Doctors...');
    const doctors = await IstomaService.getDoctors();
    if (!doctors || doctors.length === 0) {
        console.error('❌ Failed to get doctors.');
        return;
    }
    console.log(`✅ Found ${doctors.length} doctors.`);

    // 2. Get Locations
    console.log('\n[2] Fetching Locations...');
    const locations = await IstomaService.getLocations();
    if (!locations || locations.length === 0) {
        console.error('❌ Failed to get locations.');
        return;
    }
    console.log(`✅ Found ${locations.length} locations.`);

    // 3. Get Slots for multiple days
    const dates = ['28.01.2026', '29.01.2026', '30.01.2026'];
    console.log(`\n[3] Fetching Slots for dates: ${dates.join(', ')}...`);

    const doctorIds = doctors.map(d => d.Id);
    const locationIds = locations.map(l => l.ID);

    let slots = [];
    let foundDate = '';

    for (const d of dates) {
        console.log(`   Checking ${d}...`);
        const s = await IstomaService.getAvailableSlots(d, doctorIds, locationIds);
        if (s && s.length > 0) {
            slots = s;
            foundDate = d;
            break;
        }
    }

    if (!slots || slots.length === 0) {
        console.warn(`⚠️ No slots found via GetListaIntervaleActivitate.`);
        console.log(`\n[3b] Trying GetPrimeleSloturiLibere (First Available)...`);

        slots = await IstomaService.getFirstFreeSlots(5, doctorIds, locationIds);

        if (!slots || slots.length === 0) {
            console.error('❌ No slots found even with GetPrimeleSloturiLibere.');
            return;
        }

        // Extract date from the found slot
        const fSlot = slots[0];
        let dStr = fSlot.dataInceputInterval || fSlot.DataInceputInterval || fSlot.StartDate || "";
        // Extract Date Part DD.MM.YYYY
        // 29.01.2026 or 2026-01-29
        if (dStr) {
            if (dStr.includes(' ')) dStr = dStr.split(' ')[0];
            else if (dStr.includes('T')) dStr = dStr.split('T')[0];

            // Normalize to DD.MM.YYYY if needed for AddAppointment?
            // Test format: foundDate needs to be DD.MM.YYYY for my logging/logic?
            // AddAppointment takes "date" then removes dots. So it expects DD.MM.YYYY.
            // If it is YYYY-MM-DD, we should convert.
            if (dStr.includes('-')) {
                const parts = dStr.split('-');
                if (parts[0].length === 4) {
                    // YYYY-MM-DD -> DD.MM.YYYY
                    foundDate = `${parts[2]}.${parts[1]}.${parts[0]}`;
                } else {
                    foundDate = dStr;
                }
            } else {
                foundDate = dStr;
            }
        }
        console.log(`✅ Found Prime Slots. Will book on ${foundDate}.`);
    } else {
        console.log(`✅ Found ${slots.length} slots on ${foundDate} via standard check.`);
    }

    console.log(`   Sample Slot:`, JSON.stringify(slots.slice(0, 1), null, 2));

    // 4. Attempt Booking
    console.log('\n[4] Attempting to Book First Available Slot...');
    const firstSlot = slots[0];

    // Extract info
    // Assuming structure based on previous errors/docs
    // "id medic, id locatie (sediu), id cabinet, data inceput interval, data final interval"
    // AND JSON likely has keys: 'IdMedic', 'IdCabinet', 'DataInceputInterval' etc (PascalCase based on doctors response)

    let time = '10:00';
    let dateTimeStr = firstSlot.DataInceputInterval || firstSlot.dataInceputInterval || firstSlot.StartDate || "";

    if (dateTimeStr) {
        // dateTimeStr might be "29.01.2026 09:00" or ISO
        const parts = dateTimeStr.split(' ');
        if (parts.length > 1) {
            time = parts[1].substring(0, 5); // HH:mm
        } else if (dateTimeStr.includes('T')) {
            time = dateTimeStr.split('T')[1].substring(0, 5);
        }
    }
    console.log(`   Target Time: ${time}`);

    const docId = firstSlot.IdMedic || firstSlot.idMedic || doctorIds[0];
    const cabId = firstSlot.IdCabinet || firstSlot.idCabinet || 0;

    const patientData = {
        nume: 'TEST_BOT',
        prenume: 'VERIFICATION',
        telefon: '0700000000',
        email: 'test@example.com'
    };

    console.log(`   Booking for Doctor ID: ${docId}, Cabinet ID: ${cabId}`);

    const result = await IstomaService.addAppointment(
        patientData,
        foundDate,
        time,
        30,
        docId,
        cabId
    );

    console.log('\n[5] Booking Result:');
    console.log(JSON.stringify(result, null, 2));

    // Check if result indicates success (e.g. returns "13")
    if (result === 13 || result === '13' || (result && result.message === '13') || (result && result.Message === '13')) {
        console.log('✅ APPOINTMENT BOOKED SUCCESSFULLY!');
    } else {
        console.log('❌ Booking response was not standard success code (13). Please check logs.');
    }
}

testFullFlow();
