const http = require('http');

const data = JSON.stringify({
    url: "https://www.instagram.com/reel/C7-3u62vL9w/",
    filename: "InstagramTest.mp4",
    id: "test1"
});

const options = {
    hostname: process.env.API_HOST || '127.0.0.1',
    port: 3000,
    path: '/api/download',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    let responseData = '';
    res.on('data', chunk => responseData += chunk);
    res.on('end', () => console.log('Response:', responseData));
});

req.on('error', console.error);
req.write(data);
req.end();
