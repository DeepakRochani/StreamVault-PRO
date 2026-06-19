const db = require('better-sqlite3')('C:/Users/DR Films/Documents/StreamVaultData/streamvault.db');
const admin = db.prepare("SELECT id, email, role, password_reset_required FROM users WHERE email = 'admin@streamvault.com'").get();
console.log('Admin:', admin);
