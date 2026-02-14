const http = require('http');
const path = require('path');

const boundary = '----TestBoundary' + Date.now();

function field(name, value) {
    return `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
}

const transcript = JSON.stringify([
    { text: 'Welcome to the living room', timestamp: 1000, isFinal: true },
    { text: 'This has hardwood floors', timestamp: 5000, isFinal: true },
    { text: 'Moving into the kitchen now', timestamp: 10000, isFinal: true },
    { text: 'Granite countertops throughout', timestamp: 15000, isFinal: true },
]);

const roomBoundaries = JSON.stringify([
    { roomName: 'Living Room', startTime: 0, endTime: 9000 },
    { roomName: 'Kitchen', startTime: 9000, endTime: 20000 },
]);

let body = '';
body += field('propertyName', 'Test Property');
body += field('address', '123 Test Street, Anytown USA');
body += field('transcript', transcript);
body += field('roomBoundaries', roomBoundaries);
body += field('photoMetadata', '[]');
body += `--${boundary}--\r\n`;

const options = {
    hostname: 'localhost',
    port: 9000,
    path: '/api/capture/upload',
    method: 'POST',
    headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(body),
    },
};

console.log('📤 Testing upload endpoint...');

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        const json = JSON.parse(data);
        console.log('Response:', JSON.stringify(json, null, 2));

        if (json.captureId) {
            console.log(`\n📊 Checking status for ${json.captureId}...`);
            http.get(`http://localhost:9000/api/capture/${json.captureId}/status`, (sRes) => {
                let sData = '';
                sRes.on('data', (c) => (sData += c));
                sRes.on('end', () => {
                    console.log(`Status: ${sRes.statusCode}`);
                    console.log('Response:', JSON.stringify(JSON.parse(sData), null, 2));
                });
            });
        }
    });
});

req.on('error', (e) => console.error('Error:', e.message));
req.write(body);
req.end();
