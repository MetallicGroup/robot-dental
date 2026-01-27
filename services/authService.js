const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

let loaded = false;
let users = [];

function ensureLoaded() {
    if (loaded) return;
    try {
        const raw = fs.readFileSync(USERS_FILE, 'utf8');
        users = JSON.parse(raw);
    } catch (_) {
        users = [];
    }
    loaded = true;

    // Ensure at least one admin user
    if (users.length === 0) {
        const defaultUser = process.env.ADMIN_USER || 'admin@supersmile.ro';
        const defaultPass = process.env.ADMIN_PASS || 'admin123';
        const hash = bcrypt.hashSync(defaultPass, 10);
        users.push({
            id: 1,
            username: defaultUser,
            passwordHash: hash,
            role: 'admin'
        });
        persist();
        console.log(`[AUTH] Created default admin user: ${defaultUser} / ${defaultPass}`);
    }
}

function persist() {
    try {
        const dir = path.dirname(USERS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    } catch (err) {
        console.error('Error persisting users:', err.message);
    }
}

const AuthService = {
    async validateUser(username, password) {
        ensureLoaded();
        const user = users.find(u => u.username === username);
        if (!user) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, username: user.username, role: user.role };
    }
};

module.exports = AuthService;

