const IstomaService = require('./services/istomaService');
require('dotenv').config();

async function debug() {
    console.log('--- Debugging Istoma Service ---');
    console.log('ISTOMA_BASE_URL:', process.env.ISTOMA_BASE_URL ? 'Defined' : 'Missing');
    console.log('ISTOMA_KEY:', process.env.ISTOMA_KEY ? 'Defined' : 'Missing');

    console.log('\nFetching Doctors...');
    const doctors = await IstomaService.getDoctors();
    console.log('Doctors:', doctors);

    console.log('\nFetching Locations...');
    const locations = await IstomaService.getLocations();
    console.log('Locations:', locations);

    if (doctors.length === 0) {
        console.log('No doctors found. Cannot check slots properly.');
    }

    // Try checking slots for a future date
    const testDate = '28.01.2026';
    const doctorIds = doctors.map(d => d.id);
    const locationIds = locations.map(l => l.ID);

    console.log(`\nChecking Slots for ${testDate} with docs ${doctorIds} and locs ${locationIds}...`);
    const slots = await IstomaService.getAvailableSlots(testDate, doctorIds, locationIds);
    console.log('Slots found:', slots.length);
    if (slots.length > 0) console.log('First slot:', slots[0]);

    console.log('\nChecking First Free Slots fallback...');
    const freeSlots = await IstomaService.getFirstFreeSlots(5, doctorIds, locationIds);
    console.log('Free Slots found:', freeSlots.length);
    if (freeSlots.length > 0) console.log('First free slot:', freeSlots[0]);
}

debug();
