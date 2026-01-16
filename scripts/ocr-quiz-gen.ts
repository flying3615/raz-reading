import fs from 'fs';
import path from 'path';
import { createWorker } from 'tesseract.js';
import pdf2img from 'pdf-img-convert';
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
            // 如果已经生成过，且不是强制重新生成，则跳过? (暂不跳过，允许覆盖)
            queue.push({ ...book, level: lvl });
        });
    });

    if (limit > 0) {
        queue = queue.slice(0, limit);
    }

    console.log(`📚 Found ${queue.length} books to process.`);

    for (const book of queue) {
        console.log(`\n--------------------------------------------------`);
        console.log(`📖 Processing [${book.level}] ${book.title} (ID: ${book.id})...`);
        const pdfPath = path.join(PDF_BASE_DIR, `${book.level} 级别pdf`, `${book.level}[PDF]`, `${book.level}[PDF]`, book.pdfPath);

        if (!fs.existsSync(pdfPath)) {
            console.warn(`⚠️ PDF not found: ${pdfPath}`);
            continue;
        }

        try {
            // 1. PDF 转换为图片
            // 只取前 5 页 (通常包含主要故事内容，避开最后一页可能是封底)
            console.log(`   📸 Converting PDF to images...`);
            const pdfImages = await pdf2img.convert(pdfPath, {
                page_numbers: [2, 3, 4, 5, 6], // Skip cover (1)
                width: 1000 // Resize for better OCR performance/speed
            });

            // 2. OCR 识别文本
            console.log(`   📝 Extracting text with Tesseract...`);
            let fullText = '';
            for (let i = 0; i < pdfImages.length; i++) {
                // pdf-img-convert returns Uint8Array (buffer)
                // @ts-ignore
                const ret = await worker.recognize(pdfImages[i]);
                fullText += ret.data.text + '\n';
            }

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

Story text:
"${fullText.substring(0, 3000)}"

Return ONLY valid JSON in the following format:
{
  "quiz": [
    { "question": "...", "options": ["A", "B", "C"], "correctAnswer": 0 } // index of correct option
  ],
  "vocabulary": [
    { "word": "...", "definition": "..." } // English definition only
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
