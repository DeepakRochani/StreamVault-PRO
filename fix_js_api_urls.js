const fs = require('fs');
const path = require('path');

const jsFiles = ['settings.js', 'global-status.js', 'ads.js', 'updater.js', 'update_frontend.js'];

jsFiles.forEach(file => {
    if (!fs.existsSync(file)) return;
    let code = fs.readFileSync(file, 'utf8');
    let original = code;
    
    // Replace fetch('/api/ with fetch((window.API_BASE_URL || '') + '/api/
    code = code.replace(/fetch\(\s*['"]\/api\//g, "fetch((window.API_BASE_URL || '') + '/api/");
    code = code.replace(/fetch\(\s*\/api\//g, "fetch((window.API_BASE_URL || '') + /api/");
    
    if (code !== original) {
        fs.writeFileSync(file, code);
        console.log('Updated ' + file);
    }
});
