// Extract text from PDF using pdfjs-dist
const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');

async function main() {
    const data = new Uint8Array(fs.readFileSync('apollo-capture-spec.md.pdf'));
    const doc = await pdfjsLib.getDocument({ data }).promise;
    console.log(`Pages: ${doc.numPages}\n`);

    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map(item => item.str).join(' ');
        console.log(`--- PAGE ${i} ---`);
        console.log(text);
        console.log('');
    }
}

main().catch(e => console.error('Error:', e.message));
