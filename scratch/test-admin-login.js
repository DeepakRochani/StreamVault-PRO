const bcrypt = require('bcrypt');
const db = require('better-sqlite3')('C:/Users/DR Films/Documents/StreamVaultData/streamvault.db');

async function test() {
    const adminEmail = 'admin@streamvault.com';
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(adminEmail);
    console.log('User:', user.email, 'Role:', user.role);
    const match = await bcrypt.compare('streamvault2026', user.password_hash);
    console.log('Password match:', match);
}
test();
