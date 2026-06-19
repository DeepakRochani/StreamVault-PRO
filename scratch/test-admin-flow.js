const http = require('http');

const postData = JSON.stringify({ email: 'admin@streamvault.com', password: 'streamvault2026' });

const req1 = http.request({
    hostname: process.env.API_HOST || '127.0.0.1',
    port: 3000,
    path: '/api/admin/login',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('Login response:', data);
        const setCookie = res.headers['set-cookie'];
        console.log('Set-Cookie:', setCookie);

        if (setCookie) {
            const req2 = http.request({
                hostname: process.env.API_HOST || '127.0.0.1',
                port: 3000,
                path: '/api/admin/analytics',
                method: 'GET',
                headers: {
                    'Cookie': setCookie[0].split(';')[0]
                }
            }, (res2) => {
                let data2 = '';
                res2.on('data', chunk => data2 += chunk);
                res2.on('end', () => {
                    console.log('Analytics response:', data2);
                });
            });
            req2.end();
        }
    });
});

req1.write(postData);
req1.end();
