const http = require('http');

const options = {
  hostname: process.env.API_HOST || '127.0.0.1',
  port: 3000,
  path: '/api/admin/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Login Response:', res.statusCode, data);
    console.log('Set-Cookie:', res.headers['set-cookie']);
    
    if (res.headers['set-cookie']) {
        const cookie = res.headers['set-cookie'][0].split(';')[0];
        
        const analyticsReq = http.request({
            hostname: process.env.API_HOST || '127.0.0.1',
            port: 3000,
            path: '/api/admin/analytics',
            method: 'GET',
            headers: {
                'Cookie': cookie
            }
        }, (res2) => {
            let data2 = '';
            res2.on('data', (chunk) => data2 += chunk);
            res2.on('end', () => {
                console.log('Analytics Response:', res2.statusCode, data2);
            });
        });
        analyticsReq.end();
    }
  });
});

req.write(JSON.stringify({ email: 'admin@streamvault.local', password: 'admin' })); // default is admin2026? I'll try admin2026.
// Wait, the user prompt said "admin2026" earlier. I will use admin2026 if 'admin' fails.
req.end();
