const axios = require('axios');

const BASE_URL = 'http://localhost:3000/webhook';

const mockMessages = [
    // 1. Trigger "Programează-mă"
    {
        object: 'whatsapp_business_account',
        entry: [{
            changes: [{
                value: {
                    messages: [{
                        from: '40700000000',
                        type: 'text',
                        text: { body: 'Programează-mă' }
                    }]
                }
            }]
        }]
    },
    // 2. Reply with Date "Maine"
    {
        object: 'whatsapp_business_account',
        entry: [{
            changes: [{
                value: {
                    messages: [{
                        from: '40700000000',
                        type: 'text',
                        text: { body: 'Maine' }
                    }]
                }
            }]
        }]
    },
    // 3. Select Slot (Mock selection)
    // Note: In real flow, this ID depends on what server sends back. 
    // We can't easily dynamic this in a static array script without logic.
    // So we just test the first two steps to see logs.
];

async function runTests() {
    console.log('--- Testing Webhook Verification ---');
    try {
        const verifyRes = await axios.get(BASE_URL, {
            params: {
                'hub.mode': 'subscribe',
                'hub.verify_token': 'dental',
                'hub.challenge': 'CHALLENGE_ACCEPTED'
            }
        });
        console.log('Verification Response:', verifyRes.data);
    } catch (e) {
        console.error('Verification Failed:', e.message);
    }

    console.log('\n--- Testing "Programează-mă" ---');
    try {
        await axios.post(BASE_URL, mockMessages[0]);
        console.log('Sent "Programează-mă"');
    } catch (e) {
        console.error('Failed:', e.message);
    }

    console.log('\n--- Testing Date Input "Maine" ---');
    try {
        await axios.post(BASE_URL, mockMessages[1]);
        console.log('Sent "Maine"');
    } catch (e) {
        console.error('Failed:', e.message);
    }
}

runTests();
