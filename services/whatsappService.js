const axios = require('axios');
require('dotenv').config();

const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN;

const whatsappClient = axios.create({
    baseURL: `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}`,
    headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
    }
});

const WhatsappService = {
    async sendMessage(to, text) {
        try {
            await whatsappClient.post('/messages', {
                messaging_product: 'whatsapp',
                to: to,
                type: 'text',
                text: { body: text }
            });
        } catch (error) {
            console.error('Error sending WhatsApp message:', error.response?.data || error.message);
        }
    },

    async sendButtons(to, text, buttons) {
        // buttons: [{ id: '1', title: 'Option 1' }]
        try {
            await whatsappClient.post('/messages', {
                messaging_product: 'whatsapp',
                to: to,
                type: 'interactive',
                interactive: {
                    type: 'button',
                    body: { text: text },
                    action: {
                        buttons: buttons.map(btn => ({
                            type: 'reply',
                            reply: {
                                id: btn.id,
                                title: btn.title
                            }
                        }))
                    }
                }
            });
        } catch (error) {
            console.error('Error sending WhatsApp buttons:', error.response?.data || error.message);
        }
    },

    async sendList(to, text, buttonText, sections) {
        try {
            await whatsappClient.post('/messages', {
                messaging_product: 'whatsapp',
                to: to,
                type: 'interactive',
                interactive: {
                    type: 'list',
                    body: { text: text },
                    action: {
                        button: buttonText,
                        sections: sections
                    }
                }
            });
        } catch (error) {
            console.error('Error sending WhatsApp list:', error.response?.data || error.message);
        }
    },

    async sendTemplate(to, templateName, languageCode, components) {
        try {
            await whatsappClient.post('/messages', {
                messaging_product: 'whatsapp',
                to: to,
                type: 'template',
                template: {
                    name: templateName,
                    language: { code: languageCode },
                    components: components
                }
            });
            return true;
        } catch (error) {
            console.error('Error sending template:', error.response?.data || error.message);
            return false;
        }
    }
};

module.exports = WhatsappService;
