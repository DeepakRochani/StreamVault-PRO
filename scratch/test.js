const db = require('better-sqlite3')('C:/Users/DR Films/Documents/StreamVaultData/streamvault.db');
db.exec("UPDATE app_settings SET value_json='false' WHERE key='login_enabled'");
console.log('updated db');
