
import { readdirSync, statSync, writeFileSync } from 'fs';
import { join, basename } from 'path';

const PDF_BASE_DIR = '/Volumes/SD/raz/RAZ绘本pdf';
const AUDIO_BASE_DIR = '/Volumes/SD/raz/raz音频';
const OUTPUT_FILE = '/Volumes/SD/raz/web/src/data/books.json';

// 复用 Worker 的 filename 解析逻辑
function parseFileName(fileName: string): { number: string; title: string } | null {
    const match = fileName.match(/^(?:(\d+)[.\-_\s]+)?(.+?)(?:_Password.*)?\.(?:pdf|mp3)$/i);

    if (match) {
        let title = match[2]
            .replace(/[_\-\.]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        return {
            number: match[1] || '',
            title: title
        };
    }
    return null;
}

function normalizeTitle(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// 递归收集文件
function collectFiles(baseDir: string, subDir: string, ext: string): string[] {
    const files: string[] = [];
    const dirPath = join(baseDir, subDir);

    if (!statSync(dirPath).isDirectory()) return [];

    const collectRecursive = (path: string): string[] => {
        const items = readdirSync(path);
        const res: string[] = [];
        for (const item of items) {
            if (item.startsWith('.')) continue;
            const fullPath = join(path, item);
            const s = statSync(fullPath);
            if (s.isDirectory()) {
                res.push(...collectRecursive(fullPath));
            } else if (item.toLowerCase().endsWith(ext)) {
                res.push(fullPath);
            }
        }
        return res;
    };

    return collectRecursive(dirPath);
}

// 级别映射
const LEVEL_MAP: Record<string, string> = {
    'AA绘本pdf': 'AA', 'A级别pdf': 'A', 'B级别PDF': 'B', 'C级别PDF': 'C',
    'D级别PDF': 'D', 'E级别PDF': 'E', 'F级别PDF': 'F', 'G级别PDF': 'G',
    'H 级别PDF': 'H', 'I 级别pdf': 'I', 'J 级别pdf': 'J', 'K级别pdf': 'K',
    'L级别pdf': 'L', 'M 级别pdf': 'M', 'N级别pdf': 'N', 'O级别pdf': 'O',
    'P 级别pdf': 'P', 'Q 电子书pdf': 'Q', 'R级别pdf': 'R', 'S级别pdf': 'S',
    'T级别pdf': 'T', 'U 级别pdf': 'U', 'V级别pdf': 'V', 'W 级别pdf': 'W',
    'X级别pdf': 'X', 'Y级别pdf': 'Y', 'Z级别pdf': 'Z', 'Z1 级别pdf': 'Z1',
    'Z2 级别pdf': 'Z2'
};

const AUDIO_LEVEL_MAP: Record<string, string> = {
    'AA｛mp3｝': 'AA', 'A{mp3}': 'A', 'B[Mp3]': 'B', 'C[Mp3]': 'C',
    'D[Mp3]': 'D', 'E[Mp3]': 'E', 'F[Mp3]': 'F', 'G[Mp3]': 'G',
    'H[Mp3]': 'H', 'I[Mp3]': 'I', 'J[Mp3]': 'J', 'K[Mp3]': 'K',
    'L[Mp3]': 'L', 'M[Mp3]': 'M', 'N[Mp3]': 'N', 'O[Mp3]': 'O',
    'P[Mp3]': 'P', 'Q[Mp3]': 'Q', 'R[Mp3]': 'R', 'S[Mp3]': 'S',
    'T[Mp3]': 'T', 'U[Mp3]': 'U', 'V[Mp3]': 'V', 'W[Mp3]': 'W',
    'X[Mp3]': 'X', 'Y[Mp3]': 'Y', 'Z[Mp3]': 'Z', 'Z1[Mp3]': 'Z1',
    'Z2[Mp3]': 'Z2', 'aa[Mp3]': 'AA',
};

interface Book {
    id: string;
    number: string;
    title: string;
    level: string;
    pdfPath: string;
    audioPath: string;
}

const booksData: Record<string, Book[]> = {};

function main() {
    console.log('Generating books.json...');

    // 1. 构建音频映射
    console.log('Building audio map...');
    const audioMap = new Map<string, Map<string, string>>(); // Level -> Key -> Filename

    for (const dir of readdirSync(AUDIO_BASE_DIR)) {
        if (dir.startsWith('.')) continue;
        const level = AUDIO_LEVEL_MAP[dir] || Object.keys(AUDIO_LEVEL_MAP).find(k => k === dir) ? AUDIO_LEVEL_MAP[dir] : null;

        if (!level && !Object.values(AUDIO_LEVEL_MAP).includes(dir)) {
            // 简单的回退尝试，如果map不全
            // 但我们假设 map 是全的，除了可能的 unicode 问题。
            // 这里我们只处理能匹配上的。
            if (dir.includes('Mp3') || dir.includes('mp3')) {
                // console.log('Skipping unmatched audio dir:', dir);
            }
            continue;
        }

        // 实际上上面的逻辑有点乱，直接用 key 查找
        const mappedLevel = AUDIO_LEVEL_MAP[dir];
        if (!mappedLevel) continue;

        if (!audioMap.has(mappedLevel)) {
            audioMap.set(mappedLevel, new Map());
        }

        const files = collectFiles(AUDIO_BASE_DIR, dir, '.mp3');
        const levelAudioMap = audioMap.get(mappedLevel)!;

        for (const filePath of files) {
            const fileName = basename(filePath);
            const parsed = parseFileName(fileName);
            if (parsed) {
                const key = `${parsed.number}_${normalizeTitle(parsed.title)}`;
                levelAudioMap.set(key, fileName);
            }
        }
    }

    // 2. 处理 PDF 并生成 Book 数据
    for (const dir of readdirSync(PDF_BASE_DIR)) {
        if (dir.startsWith('.')) continue;
        const level = LEVEL_MAP[dir];
        if (!level) continue;

        console.log(`Processing Level ${level}...`);

        const files = collectFiles(PDF_BASE_DIR, dir, '.pdf');
        const levelBooks: Book[] = [];
        const levelAudioMap = audioMap.get(level) || new Map();

        let autoIndex = 1;

        for (const filePath of files) {
            const fileName = basename(filePath);
            const parsed = parseFileName(fileName);
            if (!parsed) continue;

            const key = `${parsed.number}_${normalizeTitle(parsed.title)}`;
            const audioFileName = levelAudioMap.get(key) || '';

            const displayNumber = parsed.number || String(autoIndex++);

            levelBooks.push({
                id: displayNumber,
                number: displayNumber,
                title: parsed.title,
                level: level,
                pdfPath: fileName,
                audioPath: audioFileName,
            });
        }

        // 排序
        levelBooks.sort((a, b) => {
            const numA = parseInt(a.number) || 9999;
            const numB = parseInt(b.number) || 9999;
            return numA - numB;
        });

        booksData[level] = levelBooks;
    }

    // 写入 JSON
    writeFileSync(OUTPUT_FILE, JSON.stringify(booksData, null, 2));
    console.log(`✅ Generated books.json with ${Object.keys(booksData).length} levels.`);
}

main();
