/**
 * Quick test: sends a minimal capture upload to the deployed backend
 * to verify the full pipeline including Notion sync.
 */

const BASE = process.argv[2] || 'https://apollo-capture-backend-production.up.railway.app';

async function main() {
    const formData = new FormData();
    formData.append('propertyName', 'Test Property - 123 Main St');
    formData.append('propertyAddress', '123 Main Street, Austin TX 78701');
    formData.append('transcript', JSON.stringify([
        { text: 'Welcome to this beautiful property. This is the living room with hardwood floors and large windows.', timestampSeconds: 0 },
        { text: 'Moving into the kitchen here. Granite countertops, stainless steel appliances, recently updated.', timestampSeconds: 30 },
        { text: 'And here is the master bedroom. Very spacious, walk-in closet on the left.', timestampSeconds: 60 },
    ]));
    formData.append('photoMetadata', '[]');
    formData.append('roomBoundaries', JSON.stringify([
        { roomName: 'Living Room', timestampSeconds: 0 },
        { roomName: 'Kitchen', timestampSeconds: 30 },
        { roomName: 'Master Bedroom', timestampSeconds: 60 },
    ]));

    console.log(`Uploading test capture to ${BASE}/api/capture/upload ...`);

    const res = await fetch(`${BASE}/api/capture/upload`, {
        method: 'POST',
        body: formData,
    });

    const data = await res.json();
    console.log(`Response (${res.status}):`, JSON.stringify(data, null, 2));

    if (!data.captureId) {
        console.error('No captureId returned');
        return;
    }

    const captureId = data.captureId;
    console.log(`\nPolling status for ${captureId}...`);

    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 5000));

        const statusRes = await fetch(`${BASE}/api/capture/${captureId}/status`);
        const status = await statusRes.json();
        console.log(`  [${i + 1}] ${status.status} - ${status.currentStep || 'waiting'}${status.progress ? ` (${Math.round(status.progress * 100)}%)` : ''}`);

        if (status.status === 'completed' || status.status === 'failed') {
            console.log('\nFinal status:', JSON.stringify(status, null, 2));

            if (status.status === 'completed') {
                const resultRes = await fetch(`${BASE}/api/capture/${captureId}/result`);
                const result = await resultRes.json();
                console.log('\nResult:', JSON.stringify(result, null, 2).slice(0, 2000));

                if (result.notionPageUrl) {
                    console.log(`\nNotion page created: ${result.notionPageUrl}`);
                }
            }
            return;
        }
    }
    console.log('Timed out after 2.5 minutes');
}

main().catch(err => console.error('Error:', err));
