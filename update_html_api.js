const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const htmlFiles = fs.readdirSync(rootDir).filter(file => file.endsWith('.html'));

htmlFiles.forEach(file => {
    const filePath = path.join(rootDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // Inject config.js before other scripts if not already present
    if (!content.includes('@supabase/supabase-js@2')) {
        // Try to inject it before the first script tag, or before </head>
        if (content.includes('<script')) {
            content = content.replace('<script', '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>`n    <script src="js/config.js"></script>\n    <script');
        } else if (content.includes('</head>')) {
            content = content.replace('</head>', '    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>`n    <script src="js/config.js"></script>\n</head>');
        }
        modified = true;
    }

    // Replace fetch('/api/... with fetch((window.API_BASE_URL || '') + '/api/...
    // Using a regex to catch fetch('/api/ and fetch(`/api/
    const fetchRegex = /fetch\((['"`])\/api\//g;
    if (fetchRegex.test(content)) {
        content = content.replace(fetchRegex, "fetch((window.API_BASE_URL || '') + $1/api/");
        modified = true;
    }

    if (modified) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${file}`);
    }
});

console.log('Update complete.');


