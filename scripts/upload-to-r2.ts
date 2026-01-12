/**
 * RAZ 文件批量上传到 Cloudflare R2
 * 
 * 使用前请先设置环境变量：
 * export R2_ACCOUNT_ID="你的账户ID"
 * export R2_ACCESS_KEY_ID="你的访问密钥ID"
 * export R2_SECRET_ACCESS_KEY="你的访问密钥"
 * 
 * 运行: npm run upload
 */

import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';

// 配置
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const BUCKET_NAME = 'raz-files';

// 本地目录路径
const PDF_BASE_DIR = '/Volumes/SD/raz/RAZ绘本pdf';
const AUDIO_BASE_DIR = '/Volumes/SD/raz/raz音频';

// 并发上传数量
const CONCURRENCY = 5;

// 级别目录映射
const LEVEL_MAP: Record<string, string> = {
    'AA绘本pdf': 'AA',
    'A级别pdf': 'A',
    'B级别PDF': 'B',
    'C级别PDF': 'C',
    'D级别PDF': 'D',
    'E级别PDF': 'E',
    'F级别PDF': 'F',
    'G级别PDF': 'G',
    'H 级别PDF': 'H',
    'I 级别pdf': 'I',
    'J 级别pdf': 'J',
    'K级别pdf': 'K',
    'L级别pdf': 'L',
    'M 级别pdf': 'M',
    'N级别pdf': 'N',
    'O级别pdf': 'O',
    'P 级别pdf': 'P',
    'Q 电子书pdf': 'Q',
    'R级别pdf': 'R',
    'S级别pdf': 'S',
    'T级别pdf': 'T',
    'U 级别pdf': 'U',
    'V级别pdf': 'V',
    'W 级别pdf': 'W',
    'X级别pdf': 'X',
    'Y级别pdf': 'Y',
    'Z级别pdf': 'Z',
    'Z1 级别pdf': 'Z1',
    'Z2 级别pdf': 'Z2',
};

const AUDIO_LEVEL_MAP: Record<string, string> = {
    'AA｛mp3｝': 'AA',
    'A{mp3}': 'A',
    'B[Mp3]': 'B',
    'C[Mp3]': 'C',
    'D[Mp3]': 'D',
    'E[Mp3]': 'E',
    'F[Mp3]': 'F',
    'G[Mp3]': 'G',
    'H[Mp3]': 'H',
    'I[Mp3]': 'I',
    'J[Mp3]': 'J',
    'K[Mp3]': 'K',
    'L[Mp3]': 'L',
    'M[Mp3]': 'M',
    'N[Mp3]': 'N',
    'O[Mp3]': 'O',
    'P[Mp3]': 'P',
    'Q[Mp3]': 'Q',
    'R[Mp3]': 'R',
    'S[Mp3]': 'S',
    'T[Mp3]': 'T',
    'U[Mp3]': 'U',
    'V[Mp3]': 'V',
    'W[Mp3]': 'W',
    'X[Mp3]': 'X',
    'Y[Mp3]': 'Y',
    'Z[Mp3]': 'Z',
    'Z1[Mp3]': 'Z1',
    'Z2[Mp3]': 'Z2',
    'aa[Mp3]': 'AA',
};

// 初始化 S3 客户端 (R2 兼容 S3 API)
const s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
    },
});

interface FileToUpload {
    localPath: string;
    r2Key: string;
    contentType: string;
}

// 收集所有需要上传的文件
function collectFiles(): FileToUpload[] {
    const files: FileToUpload[] = [];

    // 收集 PDF 文件
    console.log('📂 扫描 PDF 目录...');
    const pdfDirs = readdirSync(PDF_BASE_DIR).filter(d => !d.startsWith('.'));

    for (const dir of pdfDirs) {
        const level = LEVEL_MAP[dir];
        if (!level) {
            console.log(`  ⚠️ 跳过未知目录: ${dir}`);
            continue;
        }

        const dirPath = join(PDF_BASE_DIR, dir);
        const stat = statSync(dirPath);
        if (!stat.isDirectory()) continue;

        // 递归查找 PDF 文件
        const collectPdf = (path: string): string[] => {
            const items = readdirSync(path);
            const pdfs: string[] = [];

            for (const item of items) {
                if (item.startsWith('.')) continue; // 忽略隐藏文件
                const fullPath = join(path, item);
                const s = statSync(fullPath);

                if (s.isDirectory()) {
                    pdfs.push(...collectPdf(fullPath));
                } else if (item.endsWith('.pdf')) {
                    pdfs.push(fullPath);
                }
            }
            return pdfs;
        };

        const pdfFiles = collectPdf(dirPath);

        for (const filePath of pdfFiles) {
            const fileName = basename(filePath);
            files.push({
                localPath: filePath,
                r2Key: `pdf/${level}/${fileName}`,
                contentType: 'application/pdf',
            });
        }

        console.log(`  ✓ ${level}: ${pdfFiles.length} PDF 文件`);
    }

    // 收集音频文件
    console.log('\n📂 扫描音频目录...');
    const audioDirs = readdirSync(AUDIO_BASE_DIR).filter(d => !d.startsWith('.'));

    for (const dir of audioDirs) {
        const level = AUDIO_LEVEL_MAP[dir];
        if (!level) {
            console.log(`  ⚠️ 跳过未知目录: ${dir}`);
            continue;
        }

        const dirPath = join(AUDIO_BASE_DIR, dir);
        const stat = statSync(dirPath);
        if (!stat.isDirectory()) continue;

        // 递归查找 mp3 文件
        const collectMp3 = (path: string): string[] => {
            const items = readdirSync(path);
            const mp3s: string[] = [];

            for (const item of items) {
                if (item.startsWith('.')) continue;
                const fullPath = join(path, item);
                const s = statSync(fullPath);

                if (s.isDirectory()) {
                    mp3s.push(...collectMp3(fullPath));
                } else if (item.endsWith('.mp3')) {
                    mp3s.push(fullPath);
                }
            }

            return mp3s;
        };

        const mp3Files = collectMp3(dirPath);

        for (const filePath of mp3Files) {
            const fileName = basename(filePath);
            files.push({
                localPath: filePath,
                r2Key: `audio/${level}/${fileName}`,
                contentType: 'audio/mpeg',
            });
        }

        console.log(`  ✓ ${level}: ${mp3Files.length} MP3 文件`);
    }

    return files;
}

// 检查文件是否已存在
async function getExistingKeys(): Promise<Set<string>> {
    const existingKeys = new Set<string>();
    let continuationToken: string | undefined;

    console.log('\n🔍 检查已上传的文件...');

    do {
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            ContinuationToken: continuationToken,
        });

        const response = await s3Client.send(command);

        for (const obj of response.Contents || []) {
            if (obj.Key) {
                existingKeys.add(obj.Key);
            }
        }

        continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    console.log(`  已存在 ${existingKeys.size} 个文件`);
    return existingKeys;
}

// 上传单个文件
async function uploadFile(file: FileToUpload): Promise<boolean> {
    try {
        const body = readFileSync(file.localPath);

        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: file.r2Key,
            Body: body,
            ContentType: file.contentType,
        });

        await s3Client.send(command);
        return true;
    } catch (error) {
        console.error(`  ❌ 上传失败: ${file.r2Key}`, error);
        return false;
    }
}

// 批量上传
async function uploadBatch(files: FileToUpload[], startIndex: number): Promise<number> {
    const batch = files.slice(startIndex, startIndex + CONCURRENCY);
    const results = await Promise.all(batch.map(uploadFile));
    return results.filter(r => r).length;
}

// 主函数
async function main() {
    console.log('🚀 RAZ 文件上传工具\n');

    // 检查配置
    if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
        console.error('❌ 请设置以下环境变量:');
        console.error('   R2_ACCOUNT_ID');
        console.error('   R2_ACCESS_KEY_ID');
        console.error('   R2_SECRET_ACCESS_KEY');
        console.error('\n获取方法: Cloudflare Dashboard > R2 > Manage R2 API Tokens');
        process.exit(1);
    }

    // 收集文件
    const allFiles = collectFiles();
    console.log(`\n📦 共发现 ${allFiles.length} 个文件`);

    // 检查已存在的文件
    const existingKeys = await getExistingKeys();
    const filesToUpload = allFiles.filter(f => !existingKeys.has(f.r2Key));

    console.log(`📤 需要上传 ${filesToUpload.length} 个新文件\n`);

    if (filesToUpload.length === 0) {
        console.log('✅ 所有文件已上传完成！');
        return;
    }

    // 开始上传
    let uploaded = 0;
    const startTime = Date.now();

    for (let i = 0; i < filesToUpload.length; i += CONCURRENCY) {
        const count = await uploadBatch(filesToUpload, i);
        uploaded += count;

        const progress = ((i + CONCURRENCY) / filesToUpload.length * 100).toFixed(1);
        const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

        console.log(`  进度: ${Math.min(i + CONCURRENCY, filesToUpload.length)}/${filesToUpload.length} (${progress}%) - 已用时 ${elapsed} 分钟`);
    }

    const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`\n✅ 上传完成！成功 ${uploaded}/${filesToUpload.length} 个文件，耗时 ${totalTime} 分钟`);
}

main().catch(console.error);
