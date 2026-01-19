import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const pdfPath = '/Volumes/SD/raz/RAZ绘本pdf/K级别pdf/K[PDF]/K[PDF]/Abigail Adams.pdf';

async function testExtraction() {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
    const doc = await loadingTask.promise;

    console.log('=== PDF Text Extraction Test ===');
    console.log(`Total pages: ${doc.numPages}`);

    let fullText = '';
    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n';
    }

    console.log(`Text length: ${fullText.length} chars`);
    console.log('\n--- Extracted Text (first 2000 chars) ---\n');
    console.log(fullText.substring(0, 2000));
}

testExtraction().catch(console.error);
