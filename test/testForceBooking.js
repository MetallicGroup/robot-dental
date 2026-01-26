const IstomaService = require('../services/istomaService');

async function testForceBooking() {
    console.log('--- STARTING FORCE BOOKING TEST ---');

    console.log('[1] Fetching Doctors/Locations...');
    const doctors = await IstomaService.getDoctors();
    const locations = await IstomaService.getLocations();

    if (doctors.length === 0 || locations.length === 0) {
        console.error("❌ Need doctors and locations.");
        return;
    }

    const docId = doctors[0].Id;
    const locId = locations[0].ID; // Assuming location ID maps to cabinet? Or use 0.
    // AdaugaProgramare uses `pIdCabinet`. I don't have cabinet list?
    // The `GetListaIntervaleActivitate` returns `idLocatie (sediu)` AND `idCabinet`.
    // Maybe `GetListaSedii` returns Sedii. What about Cabinets?
    // Docs say: `GetListaIntervaleActivitate... Un interval contine ... id cabinet`.
    // Logically, a location (Sediu) has cabinets.
    // If I don't know cabinet ID, maybe 0 works?

    // Let's try booking:
    const testDate = '29.01.2026';
    const testTime = '12:00';

    console.log(`[2] Attempting to book INVALID/VALID slot directly on ${testDate} ${testTime}...`);
    console.log(`    Doctor: ${docId}, Cabinet: 0 (default)`);

    const patientData = {
        nume: 'BOT_TEST',
        prenume: 'FORCE',
        telefon: '0799999999',
        email: 'force@bot.com'
    };

    const result = await IstomaService.addAppointment(
        patientData,
        testDate,
        testTime,
        30,
        docId,
        0 // Cabinet 0
    );

    console.log('Result:', JSON.stringify(result, null, 2));

    if (result === 13 || result === '13' || (result && (result.message === '13' || result.Message === '13'))) {
        console.log("✅ SUCCESS: Appointed booked even without checking slot.");
    } else {
        console.log("❌ FAILURE: Could not book directly.");
    }
}

testForceBooking();
