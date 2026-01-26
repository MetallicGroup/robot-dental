const SheetService = require('../services/sheetService');
const WhatsappService = require('../services/whatsappService');

async function testFeature() {
    console.log('[1] Fetching Leads...');
    const leads = await SheetService.getLeads();
    console.log('Leads found:', leads);

    if (leads.length > 0) {
        console.log('[2] Testing Template Send to first lead...');
        const lead = leads[0];

        // Template: "dental"
        const components = [
            {
                type: 'body',
                parameters: [
                    { type: 'text', text: lead.name }
                ]
            }
        ];

        const success = await WhatsappService.sendTemplate(lead.phone, 'dental', 'ro', components);
        if (success) console.log('✅ Template sent successfully!');
        else console.log('❌ Template failed.');
    } else {
        console.log('❌ No leads to test.');
    }
}

testFeature();
