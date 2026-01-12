
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

// 配置
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const BUCKET_NAME = 'raz-files';

const s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
    },
});

async function checkLevelType(type: 'pdf' | 'audio', level: string) {
    console.log(`Checking ${type} files for level: ${level}...`);

    try {
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: `${type}/${level}/`,
            MaxKeys: 10
        });

        const response = await s3Client.send(command);

        if (!response.Contents || response.Contents.length === 0) {
            console.log(`❌ No files found in ${type}/${level}/`);
        } else {
            console.log(`✅ Found ${response.KeyCount} files in ${type}/${level}/ (showing first 10):`);
            response.Contents.forEach(obj => {
                console.log(`   - ${obj.Key} (${obj.Size} bytes)`);
            });
        }
    } catch (error) {
        console.error('Error listing objects:', error);
    }
}

async function main() {
    await checkLevelType('audio', 'J');
    await checkLevelType('pdf', 'J');
}

main();
