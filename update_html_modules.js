const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.html'));
files.forEach(file => {
    let html = fs.readFileSync(file, 'utf8');
    let original = html;
    
    // Replace <script src="js/config.js"></script> with <script type="module" src="js/config.js"></script>
    html = html.replace(/<script src="js\/config\.js"><\/script>/g, '<script type="module" src="js/config.js"></script>');
    
    // Also catch cases with double quotes or different spacing
    html = html.replace(/<script\s+src="js\/config\.js"\s*><\/script>/g, '<script type="module" src="js/config.js"></script>');
    
    if (html !== original) {
        fs.writeFileSync(file, html);
        console.log('Updated ' + file);
    }
});
