/// <reference types="@cloudflare/workers-types" />

interface Env {
    RAZ_BUCKET: R2Bucket;
    CORS_ORIGIN: string;
    AI: Ai;
}

interface Book {
    id: string;
    number: string;
    title: string;
    level: string;
    pdfPath: string;
    audioPath: string;
}

interface Level {
    id: string;
    name: string;
    bookCount: number;
}

// 解析文件名，提取编号和标题
function parseFileName(fileName: string): { number: string; title: string } | null {
    // 匹配格式: 
    // 1. "01- Farm Animals_Password_Removed.pdf" (带编号)
    // 2. "Farm Animals.pdf" (无编号)
    const match = fileName.match(/^(?:(\d+)[.\-_\s]+)?(.+?)(?:_Password.*)?\.(?:pdf|mp3)$/i);

    if (match) {
        let title = match[2]
            .replace(/[_\-\.]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        return {
            number: match[1] || '', // 如果没有匹配到数字，返回空字符串
            title: title
        };
    }
    return null;
}

// 标准化标题用于匹配
function normalizeTitle(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// CORS headers
function corsHeaders(origin: string): HeadersInit {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

// 处理 OPTIONS 请求
function handleOptions(env: Env): Response {
    return new Response(null, {
        headers: corsHeaders(env.CORS_ORIGIN),
    });
}

// 获取所有级别
async function getLevels(env: Env): Promise<Response> {
    const levels: Level[] = [];
    const levelIds = [
        'AA', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
        'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'Z1', 'Z2'
    ];

    for (const levelId of levelIds) {
        const list = await env.RAZ_BUCKET.list({ prefix: `pdf/${levelId}/`, limit: 1000 });
        const bookCount = list.objects.filter(obj => {
            const name = obj.key.split('/').pop() || '';
            return name.endsWith('.pdf') && !name.startsWith('.');
        }).length;

        levels.push({
            id: levelId,
            name: levelId,
            bookCount,
        });
    }

    return new Response(JSON.stringify({ levels }), {
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(env.CORS_ORIGIN),
        },
    });
}

// 获取某级别的所有书籍
async function getBooks(level: string, env: Env): Promise<Response> {
    const books: Book[] = [];

    // 获取 PDF 文件列表
    const pdfList = await env.RAZ_BUCKET.list({ prefix: `pdf/${level}/`, limit: 1000 });
    const audioList = await env.RAZ_BUCKET.list({ prefix: `audio/${level}/`, limit: 1000 });

    // 创建音频文件映射 (标准化标题 -> 文件名)
    const audioMap = new Map<string, string>();
    for (const obj of audioList.objects) {
        const fileName = obj.key.split('/').pop() || '';
        if (fileName.startsWith('.')) continue; // 忽略隐藏文件

        const parsed = parseFileName(fileName);
        if (parsed) {
            const key = `${parsed.number}_${normalizeTitle(parsed.title)}`;
            audioMap.set(key, fileName);
        }
    }

    // 处理 PDF 文件
    let autoIndex = 1;
    for (const obj of pdfList.objects) {
        const fileName = obj.key.split('/').pop() || '';
        if (fileName.startsWith('.')) continue; // 忽略隐藏文件

        const parsed = parseFileName(fileName);
        if (!parsed) continue;

        // 查找对应的音频文件
        const key = `${parsed.number}_${normalizeTitle(parsed.title)}`;
        const audioFileName = audioMap.get(key) || '';

        // 如果没有编号，生成默认编号用于显示和 ID
        const displayNumber = parsed.number || String(autoIndex++);

        books.push({
            id: displayNumber,
            number: displayNumber,
            title: parsed.title,
            level,
            pdfPath: fileName,
            audioPath: audioFileName,
        });
    }

    // 按编号排序
    books.sort((a, b) => {
        const numA = parseInt(a.number) || 9999;
        const numB = parseInt(b.number) || 9999;
        return numA - numB;
    });

    return new Response(JSON.stringify({ books }), {
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(env.CORS_ORIGIN),
        },
    });
}

// 获取 PDF 文件
async function getPdf(level: string, fileName: string, env: Env): Promise<Response> {
    const key = `pdf/${level}/${decodeURIComponent(fileName)}`;
    const object = await env.RAZ_BUCKET.get(key);

    if (!object) {
        return new Response('PDF not found', {
            status: 404,
            headers: corsHeaders(env.CORS_ORIGIN),
        });
    }

    return new Response(object.body, {
        headers: {
            'Content-Type': 'application/pdf',
            'Cache-Control': 'public, max-age=86400',
            ...corsHeaders(env.CORS_ORIGIN),
        },
    });
}

// 获取音频文件
async function getAudio(level: string, fileName: string, env: Env): Promise<Response> {
    const key = `audio/${level}/${decodeURIComponent(fileName)}`;
    const object = await env.RAZ_BUCKET.get(key);

    if (!object) {
        return new Response('Audio not found', {
            status: 404,
            headers: corsHeaders(env.CORS_ORIGIN),
        });
    }

    return new Response(object.body, {
        headers: {
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'public, max-age=86400',
            ...corsHeaders(env.CORS_ORIGIN),
        },
    });
}

// 录音分析
async function analyzeReading(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405, headers: corsHeaders(env.CORS_ORIGIN) });
    }

    try {
        const formData = await request.formData();
        const audioFile = formData.get('audio') as File;

        if (!audioFile) {
            return new Response('No audio file provided', { status: 400, headers: corsHeaders(env.CORS_ORIGIN) });
        }

        // 步骤 1: 转写 (Whisper)
        const audioBuffer = await audioFile.arrayBuffer();
        // Whisper input expects an array of numbers (float32) or standard audio file bytes
        // Cloudflare AI run interface for whisper handles raw bytes if passed in input
        const transcription = await env.AI.run('@cf/openai/whisper', {
            audio: [...new Uint8Array(audioBuffer)],
        });

        const transcribedText = transcription.text || '';

        // 步骤 2: 点评 (Llama 3)
        // 让 AI 扮演一位鼓励型但严谨的英语老师
        const systemPrompt = `You are a friendly and encouraging English teacher. 
        Your student just read a passage aloud. I will provide you with the text they spoke (transcribed from audio).
        
        Please provide feedback in the following JSON format:
        {
            "score": number (0-100),
            "feedback": "string (1-2 sentences of encouraging feedback)",
            "pronunciation_issues": ["word1", "word2"] (list of words that look incorrect or misspelled in the transcription, max 3)
        }

        The student's transcription is below. Focus on fluency and clarity. If the text is gibberish, give a low score.`;

        const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Student's transcription: "${transcribedText}"` }
            ]
        });

        // 尝试解析 JSON，如果 AI 返回了额外文本，尝试提取 JSON 部分
        let result = { score: 0, feedback: "Analysis failed", pronunciation_issues: [] };
        // @ts-ignore
        const aiRawResponse = response.response;

        try {
            // 简单的 JSON 提取逻辑
            const jsonMatch = aiRawResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                result = JSON.parse(jsonMatch[0]);
            } else {
                result = JSON.parse(aiRawResponse);
            }
        } catch (e) {
            // 如果解析失败，回退到纯文本反馈
            result.feedback = aiRawResponse;
            result.score = 70; // 默认分
        }

        return new Response(JSON.stringify({
            transcription: transcribedText,
            ...result
        }), {
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders(env.CORS_ORIGIN),
            },
        });

    } catch (error) {
        console.error('Analysis error:', error);
        return new Response(JSON.stringify({ error: 'DeepSeek analysis failed' }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders(env.CORS_ORIGIN),
            },
        });
    }
}

// 路由处理
export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS preflight
        if (request.method === 'OPTIONS') {
            return handleOptions(env);
        }

        // 路由匹配
        if (path === '/api/levels') {
            return getLevels(env);
        }

        const booksMatch = path.match(/^\/api\/levels\/([^/]+)\/books$/);
        if (booksMatch) {
            return getBooks(booksMatch[1], env);
        }

        const pdfMatch = path.match(/^\/api\/pdf\/([^/]+)\/(.+)$/);
        if (pdfMatch) {
            return getPdf(pdfMatch[1], pdfMatch[2], env);
        }

        const audioMatch = path.match(/^\/api\/audio\/([^/]+)\/(.+)$/);
        if (audioMatch) {
            return getAudio(audioMatch[1], audioMatch[2], env);
        }

        if (path === '/api/analyze-reading') {
            return analyzeReading(request, env);
        }

        return new Response('Not Found', {
            status: 404,
            headers: corsHeaders(env.CORS_ORIGIN),
        });
    },
};
