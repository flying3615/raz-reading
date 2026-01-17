import fs from 'fs';
import path from 'path';
import { createWorker } from 'tesseract.js';
import { PDFDocument } from 'pdf-lib';
import { execSync } from 'child_process';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// 获取命令行参数
const args = process.argv.slice(2);
const help = args.includes('--help') || args.includes('-h');
const targetBookId = args.find(a => a.startsWith('--bookId='))?.split('=')[1];
const targetLevel = args.find(a => a.startsWith('--level='))?.split('=')[1];
const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '0');

if (help) {
    console.log(`
Usage: tsx ocr-quiz-gen.ts [options]

Options:
  --bookId=<id>    Process a specific book by ID (e.g., --bookId=A_02)
  --level=<level>  Process all books in a level (e.g., --level=A)
  --limit=<num>    Limit the number of books processed (default: 0 = no limit)
  --help, -h       Show this help message
`);
    process.exit(0);
}

// DeepSeek Client (using OpenAI SDK)
const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY || 'sk-your-key-here' // Will prompt user to set this
});

const RAZ_PATH = path.resolve('/Volumes/SD/raz');
const PDF_BASE_DIR = path.join(RAZ_PATH, 'RAZ绘本pdf');
const OUTPUT_FILE = path.join(RAZ_PATH, 'web/src/data/books-content.json');

async function main() {
    if (!process.env.DEEPSEEK_API_KEY) {
        console.error('❌ Error: DEEPSEEK_API_KEY is not set in .env file.');
        console.log('Please create scripts/.env file with: DEEPSEEK_API_KEY=your_key');
        process.exit(1);
    }

    console.log('🚀 Starting OCR & Quiz Generation...');

    // 初始化 Tesseract Worker
    const worker = await createWorker('eng');

    // 加载书籍数据
    const booksDataPath = path.join(RAZ_PATH, 'web/src/data/books.json');
    const booksData = JSON.parse(fs.readFileSync(booksDataPath, 'utf-8'));

    // 加载已有生成内容
    let contentData: any = {};
    if (fs.existsSync(OUTPUT_FILE)) {
        contentData = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
    }

    // 筛选要处理的书籍
    let queue: any[] = [];
    Object.keys(booksData).forEach(lvl => {
        if (targetLevel && lvl !== targetLevel) return;

        booksData[lvl].forEach((book: any) => {
            if (targetBookId && book.id !== targetBookId) return;
            // 如果已经生成过，且包含 discussion 字段 (新版特征)，则跳过
            if (contentData[lvl] && contentData[lvl][book.id] && contentData[lvl][book.id].discussion) {
                // console.log(`Skipping ${book.id} (already generated)`);
                return;
            }
            queue.push({ ...book, level: lvl });
        });
    });

    if (limit > 0) {
        queue = queue.slice(0, limit);
    }

    console.log(`📚 Found ${queue.length} books to process.`);

    // Helper to find file recursively
    function findFile(dir: string, filename: string): string | null {
        if (!fs.existsSync(dir)) return null;
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                const found = findFile(fullPath, filename);
                if (found) return found;
            } else if (file === filename) {
                return fullPath;
            }
        }
        return null;
    }

    // Helper to find level directory
    function findLevelDir(baseDir: string, level: string): string | null {
        const dirs = fs.readdirSync(baseDir);
        // Match "K级别pdf", "H 级别PDF", "AA绘本pdf" etc.
        // Heuristic: Starts with level, contains "pdf" (case insensitive)
        const found = dirs.find(d =>
            d.toLowerCase().startsWith(level.toLowerCase()) &&
            d.toLowerCase().includes('pdf')
        );
        return found ? path.join(baseDir, found) : null;
    }

    for (const book of queue) {
        console.log(`\n--------------------------------------------------`);
        console.log(`📖 Processing [${book.level}] ${book.title} (ID: ${book.id})...`);

        // Dynamic path finding
        let pdfPath = null;
        const levelDir = findLevelDir(PDF_BASE_DIR, book.level);

        if (levelDir) {
            pdfPath = findFile(levelDir, book.pdfPath);
        }

        if (!pdfPath || !fs.existsSync(pdfPath)) {
            console.warn(`⚠️ PDF not found for ${book.title}: searched in ${levelDir || 'unknown dir'}`);
            // Try to list the level dir to debug if needed
            // if (levelDir) console.log('Dir contents:', fs.readdirSync(levelDir));
            continue;
        }

        try {
            // 1. PDF 转换为图片 (Using pdf-lib to split pages + sips to convert to png)
            // 只取前 5 页 (索引 1-5, 跳过封面 0)
            console.log(`   📸 Splitting PDF and converting to images (pdf-lib + sips)...`);

            const pdfBytes = fs.readFileSync(pdfPath);
            const pdfDoc = await PDFDocument.load(pdfBytes);
            const pageCount = pdfDoc.getPageCount();

            // Deciding which pages to process (Max 5 pages starting from page 2)
            const startPage = 1; // 0-based index, so 1 is the second page
            const endPage = Math.min(pageCount, 6);
            const pagesToProcess = [];

            for (let i = startPage; i < endPage; i++) {
                pagesToProcess.push(i);
            }

            if (pagesToProcess.length === 0) {
                console.warn(`   ⚠️ Book too short, skipping.`);
                continue;
            }

            // Create temp directory
            const tempDir = path.join(RAZ_PATH, 'scripts/temp_ocr');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

            let fullText = '';

            for (const pageIndex of pagesToProcess) {
                // Create a new PDF with just this page
                const subDoc = await PDFDocument.create();
                const [copiedPage] = await subDoc.copyPages(pdfDoc, [pageIndex]);
                subDoc.addPage(copiedPage);

                const tempPdfPath = path.join(tempDir, `temp_${pageIndex}.pdf`);
                const tempPngPath = path.join(tempDir, `temp_${pageIndex}.png`);

                fs.writeFileSync(tempPdfPath, await subDoc.save());

                // Use sips to convert to PNG
                try {
                    // sips -s format png input.pdf --out output.png (Converts first page of input)
                    // --resampleWidth 1500 to ensure good quality for OCR
                    execSync(`sips -s format png --resampleWidth 1500 "${tempPdfPath}" --out "${tempPngPath}"`, { stdio: 'ignore' });

                    if (fs.existsSync(tempPngPath)) {
                        // OCR
                        const imageBuffer = fs.readFileSync(tempPngPath);
                        // @ts-ignore
                        const ret = await worker.recognize(imageBuffer);
                        fullText += ret.data.text + '\n';

                        // Clean up png
                        fs.unlinkSync(tempPngPath);
                    }
                } catch (err) {
                    console.error(`     ❌ Failed to convert/OCR page ${pageIndex}:`, err);
                }

                // Clean up pdf
                if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
            }

            // Cleanup temp dir
            // fs.rmdirSync(tempDir); // Keep for debugging if needed, or remove

            // 2. OCR Result Processing (Removed old Logic)
            /* 
            // Old pdf2img logic removed
            const pdfImages = await pdf2img.convert(pdfPath, { 
                page_numbers: [2, 3, 4, 5, 6], // Skip cover (1)
                width: 1000 // Resize for better OCR performance/speed
            });
            ...
            */

            // 清理文本
            fullText = fullText.replace(/\s+/g, ' ').trim();
            if (fullText.length < 50) {
                console.warn(`   ⚠️ Warning: Extracted text is too short. OCR might have failed.`);
                // continue; // Don't skip, try AI anyway?
            }

            console.log(`   ✨ Extracted ${fullText.length} characters.`);

            // 3. AI 生成题目
            console.log(`   🧠 Generating Quiz & Vocab with DeepSeek...`);

            const prompt = `You are a helpful assistant for kids' reading content.
Based on the following story text (extracted via OCR), please generate:
1. 3 Multiple choice quiz questions (simple English, suitable for kids).
2. **ALL** vocabulary words found in the text that seem to be part of a "Glossary" or "Vocabulary" list (usually at the end or beginning). If no explicit list is found, identify key difficult words. **Do NOT limit the number of words.**
3. Provide simple English definitions for the vocabulary words. **NO Chinese translations.**
4. Identify the **part of speech** (e.g., noun, verb, adjective).
5. Provide a simple **example sentence** using the word (preferably from the story, or a simple one if not found).
6. Provide 1-2 **open-ended discussion questions** based on the story to encourage critical thinking. Include a brief **analysis/answer key** for parents.

Story text:
"${fullText.substring(0, 3000)}"

Return ONLY valid JSON in the following format:
{
  "quiz": [
    { "question": "...", "options": ["A", "B", "C"], "correctAnswer": 0 } // index of correct option
  ],
  "vocabulary": [
    { "word": "...", "definition": "...", "partOfSpeech": "...", "example": "..." } // English definition only
  ],
  "discussion": [
    { "question": "...", "analysis": "..." }
  ]
}`;

            const completion = await openai.chat.completions.create({
                messages: [{ role: "system", content: "You are a helpful assistant." }, { role: "user", content: prompt }],
                model: "deepseek-chat",
                response_format: { type: "json_object" }
            });

            const content = completion.choices[0].message.content;
            if (content) {
                const json = JSON.parse(content);

                // Save to map
                if (!contentData[book.level]) contentData[book.level] = {};
                contentData[book.level][book.id] = json;

                // 即时保存
                fs.writeFileSync(OUTPUT_FILE, JSON.stringify(contentData, null, 2));
                console.log(`   ✅ Saved content for ${book.title}`);
            }

        } catch (e) {
            console.error(`   ❌ Failed to process ${book.title}:`, e);
        }
    }

    await worker.terminate();
    console.log('\n🎉 All finished!');
}

main().catch(console.error);
