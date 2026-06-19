const fs = require('fs');

const filesToUpdate = ['main.js', 'server.js', 'test_login.js', 'test_login2.js', 'test_login3.js', 'test_api.js', 'scratch/test-admin-flow.js', 'vite.config.js'];

filesToUpdate.forEach(file => {
    if (!fs.existsSync(file)) return;
    let code = fs.readFileSync(file, 'utf8');
    let original = code;
    
    // In vite.config.js
    if (file === 'vite.config.js') {
        code = code.replace(/http:\/\/localhost:3000/g, "http://127.0.0.1:10000"); // Standardize dev server proxy to 10000 or process.env.PORT
    }
    // In server.js
    else if (file === 'server.js') {
        code = code.replace(/http:\/\/localhost:\$\{PORT\}/g, "http://127.0.0.1:");
    }
    // In main.js
    else if (file === 'main.js') {
        code = code.replace(/http:\/\/localhost:3000/g, "http://127.0.0.1:10000"); // the server uses port 10000 internally
    }
    else {
        // For test scripts
        code = code.replace(/hostname: 'localhost'/g, "hostname: process.env.API_HOST || '127.0.0.1'");
    }
    
    if (code !== original) {
        fs.writeFileSync(file, code);
        console.log('Updated ' + file);
    }
});
