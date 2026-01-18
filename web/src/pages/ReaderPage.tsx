import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { type Book, API_BASE } from '../types';
import booksData from '../data/books.json';
import { useProgress } from '../contexts/ProgressContext';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import booksContentData from '../data/books-content.json';


pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

function ReaderPage() {
    const { level, bookId } = useParams<{ level: string; bookId: string }>();
    const navigate = useNavigate();
    const {
        updateCurrentPage,
        addReadingTime,
        markAsCompleted,
        markRecorded,
        // markPracticed, (unused in this file now)
        getBookProgress
    } = useProgress();

    // Recorder Hook
    const {
        isRecording,
        recordingTime,
        audioBlob,
        startRecording,
        stopRecording
    } = useAudioRecorder();

    const pdfWrapperRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const [pageDimension, setPageDimension] = useState<{ width?: number; height?: number }>({});

    const [numPages, setNumPages] = useState<number>(0);
    const [pageNumber, setPageNumber] = useState<number>(1);
    const [pdfUrl, setPdfUrl] = useState<string>('');
    const [pdfLoading, setPdfLoading] = useState(true);
    const [pdfError, setPdfError] = useState<string | null>(null);

    const [audioUrl, setAudioUrl] = useState<string>('');
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1.0);
    const audioRef = useRef<HTMLAudioElement>(null);
    const [showSpeedMenu, setShowSpeedMenu] = useState(false);

    const [book, setBook] = useState<Book | null>(null);
    const [isCompleted, setIsCompleted] = useState(false);
    const [viewMode, setViewMode] = useState<'auto' | 'single' | 'double'>('auto');
    const [isTwoPageMode, setIsTwoPageMode] = useState(false);

    // Recorder UI State
    const [showRecorder, setShowRecorder] = useState(false);
    // recorderPos is no longer needed as it's integrated in bottom bar
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isPlayingPreview, setIsPlayingPreview] = useState(false);

    const [analysisResult, setAnalysisResult] = useState<{ score: number; feedback: string; pronunciation_issues?: string[] } | null>(null);

    // Practice Content State
    const [practiceContent, setPracticeContent] = useState<{ quiz: any[], vocabulary: any[], discussion?: any[] } | null>(null);
    // Practice Content State
    // Practice Content State defined above
    // showPractice state removed as we use navigation now
    // showPractice state removed as we use navigation now

    // Load practice content
    useEffect(() => {
        if (level && bookId) {
            // @ts-ignore
            const lvlContent = booksContentData[level];
            if (lvlContent && lvlContent[bookId]) {
                setPracticeContent(lvlContent[bookId]);
            } else {
                setPracticeContent(null);
            }
        }
    }, [level, bookId]);

    // Helpers for timer
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handlePlayPreview = useCallback(() => {
        if (!audioBlob) return;
        const url = URL.createObjectURL(audioBlob);
        const audio = new Audio(url);
        setIsPlayingPreview(true);
        audio.play();
        audio.onended = () => setIsPlayingPreview(false);
    }, [audioBlob]);

    const handleAnalysisStart = async (audioBlob: Blob) => {
        setIsAnalyzing(true);
        try {
            const formData = new FormData();
            formData.append('audio', audioBlob);

            // Add context if available (vocabulary words)
            if (practiceContent && practiceContent.vocabulary) {
                const keywords = practiceContent.vocabulary.map((v: any) => v.word).join(', ');
                formData.append('context', keywords);
            }

            const response = await fetch(`${API_BASE}/analyze-reading`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error('API Error Response:', errText);
                let errMsg = 'Analysis request failed';
                try {
                    const errJson = JSON.parse(errText);
                    if (errJson.error) errMsg = errJson.error;
                } catch (e) {
                    errMsg = errText || errMsg;
                }
                throw new Error(errMsg);
            }

            const result = await response.json();
            setAnalysisResult({
                score: result.score,
                feedback: result.feedback,
                pronunciation_issues: result.pronunciation_issues
            });

            // Mark as recorded when analysis is successful
            if (bookId) {
                markRecorded(bookId);
            }
        } catch (error: any) {
            console.error('Analysis failed:', error);
            alert(`Analysis failed: ${error.message || 'Unknown error'}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    // 阅读时间跟踪
    const lastSaveTime = useRef<number>(Date.now());

    useEffect(() => {
        const updateSize = () => {
            if (pdfWrapperRef.current) {
                setContainerSize({
                    width: pdfWrapperRef.current.clientWidth,
                    height: pdfWrapperRef.current.clientHeight
                });
            }
        };
        window.addEventListener('resize', updateSize);
        setTimeout(updateSize, 100);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    const [originalPageDimensions, setOriginalPageDimensions] = useState<{ width: number; height: number } | null>(null);

    const onPageLoadSuccess = useCallback(({ originalWidth, originalHeight }: { originalWidth: number; originalHeight: number }) => {
        setOriginalPageDimensions({ width: originalWidth, height: originalHeight });
    }, []);

    useEffect(() => {
        if (!containerSize.width || !containerSize.height || !originalPageDimensions) return;

        const { width: originalWidth, height: originalHeight } = originalPageDimensions;
        const padding = 20;
        const availableWidth = containerSize.width - padding;
        const availableHeight = containerSize.height - padding;

        // 计算单页适配时的缩放
        const singleScale = Math.min(
            availableWidth / originalWidth,
            availableHeight / originalHeight
        );

        // 计算双页适配时的缩放
        // 双页模式下，两页并排，总宽度是 2 * originalWidth
        const twoPageWidth = originalWidth * 2;
        const twoPageScale = Math.min(
            availableWidth / twoPageWidth,
            availableHeight / originalHeight
        );

        // 决策逻辑极大简化：只要容器宽高比超过 1.1 (稍微宽一点) 且宽度足够，就默认尝试双页
        const containerRatio = availableWidth / availableHeight;

        let finalIsTwoPage: boolean;
        if (viewMode === 'double') {
            finalIsTwoPage = true;
        } else if (viewMode === 'single') {
            finalIsTwoPage = false;
        } else {
            // Auto Mode
            finalIsTwoPage = containerRatio > 1.1 && availableWidth > 700;
        }

        setIsTwoPageMode(finalIsTwoPage);

        // 获取当前使用的缩放比例来设置尺寸
        const currentScale = finalIsTwoPage ? twoPageScale : singleScale;

        if (finalIsTwoPage) {
            setPageDimension({
                width: Math.floor(originalWidth * currentScale) - 2,
                height: Math.min(availableHeight, Math.floor(originalHeight * currentScale))
            });
        } else {
            setPageDimension({
                width: Math.floor(originalWidth * currentScale),
                height: Math.floor(originalHeight * currentScale)
            });
        }
    }, [containerSize, originalPageDimensions, viewMode]);

    useEffect(() => {
        if (!level || !bookId) return;
        const allBooks = booksData as unknown as Record<string, Book[]>;
        const foundBook = allBooks[level]?.find(b => b.id === bookId);
        if (foundBook) {
            setBook(foundBook);
            setPdfUrl(`${API_BASE}/pdf/${level}/${foundBook.pdfPath}`);
            // 只有当 audioPath 非空时才设置音频 URL
            if (foundBook.audioPath) {
                setAudioUrl(`${API_BASE}/audio/${level}/${foundBook.audioPath}`);
            }
        } else {
            fetch(`${API_BASE}/levels/${level}/books`)
                .then(res => res.json())
                .then(data => {
                    const fb = data.books?.find((b: Book) => b.id === bookId);
                    if (fb) {
                        setBook(fb);
                        setPdfUrl(`${API_BASE}/pdf/${level}/${fb.pdfPath}`);
                        if (fb.audioPath) {
                            setAudioUrl(`${API_BASE}/audio/${level}/${fb.audioPath}`);
                        }
                    }
                })
                .catch(() => setPdfError('无法加载书籍信息'));
        }
    }, [level, bookId]);

    // 初始化进度状态 (只在 bookId 变化时执行一次)
    useEffect(() => {
        if (bookId) {
            const existingProgress = getBookProgress(bookId);
            if (existingProgress) {
                setIsCompleted(existingProgress.status === 'completed');
                // 恢复上次阅读页
                if (existingProgress.currentPage > 1) {
                    setPageNumber(existingProgress.currentPage);
                }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookId]);

    // 更新当前页到进度 (防抖处理)
    useEffect(() => {
        if (book && bookId && level && numPages > 0) {
            // 使用 setTimeout 防抖，避免频繁更新
            const timer = setTimeout(() => {
                updateCurrentPage(bookId, level, book.title, pageNumber, numPages);
            }, 500);
            return () => clearTimeout(timer);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageNumber, numPages, bookId]);

    // 定期保存阅读时间 (每30秒)
    useEffect(() => {
        const interval = setInterval(() => {
            if (bookId) {
                const now = Date.now();
                const elapsed = Math.floor((now - lastSaveTime.current) / 1000);
                if (elapsed > 0) {
                    addReadingTime(bookId, elapsed);
                    lastSaveTime.current = now;
                }
            }
        }, 30000);

        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookId]);

    // 页面离开时保存阅读时间
    useEffect(() => {
        const saveOnLeave = () => {
            if (bookId) {
                const elapsed = Math.floor((Date.now() - lastSaveTime.current) / 1000);
                if (elapsed > 0) {
                    addReadingTime(bookId, elapsed);
                }
            }
        };

        window.addEventListener('beforeunload', saveOnLeave);
        return () => {
            saveOnLeave();
            window.removeEventListener('beforeunload', saveOnLeave);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookId]);

    // 标记完成处理
    const handleMarkComplete = useCallback(() => {
        if (book && bookId && level) {
            markAsCompleted(bookId, level, book.title);
            setIsCompleted(true);
        }
    }, [book, bookId, level, markAsCompleted]);

    const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
        setPdfLoading(false);
    }, []);

    const onDocumentLoadError = useCallback(() => {
        setPdfError('PDF 加载失败');
        setPdfLoading(false);
    }, []);

    // Page navigation logic
    const goToPrevPage = useCallback(() => {
        setPageNumber(p => {
            if (p <= 1) return 1;
            if (isTwoPageMode) {
                // If current is even page (2,4...), it's the left page, go back to previous group
                // If odd page (3,5...), it's the right page, go back to the group's left page? No, UI should just show "previous screen"
                // Logic:
                // P2(2+3) -> Prev -> P1
                // P4(4+5) -> Prev -> P2(2+3)
                // P3(invalid state in spread) -> Prev -> P2?

                // If currently on cover page (1), can't go back
                if (p === 1) return 1;
                // If on P2 or P3, go back to P1
                if (p <= 3) return 1;

                // Otherwise, go back 2 pages
                // Ensure alignment to even page
                const target = p % 2 === 0 ? p - 2 : p - 1 - 2;
                return Math.max(1, target);
            }
            return Math.max(1, p - 1);
        });
    }, [isTwoPageMode]);

    const goToNextPage = useCallback(() => {
        setPageNumber(p => {
            if (p >= numPages) return numPages;
            if (isTwoPageMode) {
                // P1 -> Next -> P2(2+3)
                if (p === 1) return 2;

                // P2(2+3) -> Next -> P4(4+5)
                // 确保前进到下一个偶数页
                const target = p % 2 !== 0 ? p + 1 : p + 2;
                return Math.min(numPages, target);
            }
            return Math.min(numPages, p + 1);
        });
    }, [isTwoPageMode, numPages]);

    // 渲染辅助
    const renderPdfContent = () => {
        if (!pdfUrl) return null;

        // 计算要显示的页码
        let leftPage = pageNumber;
        let rightPage: number | null = null;
        let isSpread = false;

        if (isTwoPageMode && pageNumber > 1) {
            isSpread = true;
            if (pageNumber % 2 !== 0) {
                // 奇数页，校正为左边的偶数页
                leftPage = pageNumber - 1;
            }
            // 只有当左页不是最后一页时，才显示右页
            if (leftPage < numPages) {
                rightPage = leftPage + 1;
            } else {
                // 如果没有右页 (e.g. 最后一页是偶数页)，回退到单页显示模式
                // 这样可以应用 pdf-page-single 样式 (圆角 + 居中)，而不是 pdf-page-left (切断的右边缘)
                isSpread = false;
            }
        }

        return (
            <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={null}
                className="pdf-document"
            >
                <div className={isSpread ? "book-spread" : "book-single-wrapper"} style={{ display: 'flex' }}>
                    {/* 左页 (或单页) */}
                    <div style={{ position: 'relative' }}>
                        <Page
                            key={`page-${leftPage}-${containerSize.width}`}
                            pageNumber={leftPage}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                            onLoadSuccess={onPageLoadSuccess}
                            width={pageDimension.width}
                            height={pageDimension.height}
                            loading={
                                <div style={{
                                    width: pageDimension.width || 300,
                                    height: pageDimension.height || 400,
                                    background: '#fdfbf7'
                                }} />
                            }
                            className={isSpread ? "pdf-page-left" : "pdf-page-single"}
                        />
                    </div>

                    {/* Spine Shadow Overlay */}
                    {isSpread && rightPage && <div className="book-spine-overlay" />}

                    {/* 右页 */}
                    {isSpread && rightPage && (
                        <div style={{ position: 'relative' }}>
                            <Page
                                key={`page-${rightPage}-${containerSize.width}`}
                                pageNumber={rightPage}
                                renderTextLayer={false}
                                renderAnnotationLayer={false}
                                width={pageDimension.width}
                                height={pageDimension.height}
                                loading={
                                    <div style={{
                                        width: pageDimension.width || 300,
                                        height: pageDimension.height || 400,
                                        background: '#fdfbf7'
                                    }} />
                                }
                                className="pdf-page-right"
                            />
                        </div>
                    )}
                </div>
            </Document>
        );
    };

    const togglePlay = useCallback(() => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    }, [isPlaying]);

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
        }
    };

    const handleLoadedMetadata = () => {
        if (audioRef.current) {
            setDuration(audioRef.current.duration);
        }
    };

    const progressBarRef = useRef<HTMLDivElement>(null);

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!audioRef.current || !duration || !progressBarRef.current) return;

        const rect = progressBarRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, x / rect.width));
        audioRef.current.currentTime = percentage * duration;
    };



    const setSpeed = (rate: number) => {
        setPlaybackRate(rate);
        if (audioRef.current) {
            audioRef.current.playbackRate = rate;
        }
        setShowSpeedMenu(false);
    };



    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') goToPrevPage();
            if (e.key === 'ArrowRight') goToNextPage();
            if (e.key === ' ') {
                e.preventDefault();
                togglePlay();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [numPages, isPlaying, goToPrevPage, goToNextPage, togglePlay]);

    useEffect(() => {
        const handleClickOutside = () => setShowSpeedMenu(false);
        if (showSpeedMenu) {
            document.addEventListener('click', handleClickOutside);
        }
        return () => document.removeEventListener('click', handleClickOutside);
    }, [showSpeedMenu]);

    const speedOptions = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            padding: '4px',
            gap: '4px',
            background: 'var(--bg-primary)'
        }}>
            {/* PDF Container - Full height minus player bar */}
            <div
                className="book-view-container"
                style={{
                    flex: 1,
                    // background handled by class
                    // layout handled by class
                    borderRadius: '8px',
                    overflow: 'hidden',
                    // display/justify/align handled by class
                    minHeight: 0,
                    cursor: 'pointer'
                }}
                ref={pdfWrapperRef}
                onClick={(e) => {
                    // 点击左半部分上一页，右半部分下一页
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const halfWidth = rect.width / 2;

                    // 双页模式下，可能需要更精确的点击区域判断？
                    // 暂时保持简单：左半边 Prev，右半边 Next
                    if (x < halfWidth) {
                        goToPrevPage();
                    } else {
                        goToNextPage();
                    }
                }}
            >
                {pdfLoading && (
                    <div className="loading">
                        <div className="spinner"></div>
                    </div>
                )}
                {pdfError && <div className="error-message">{pdfError}</div>}

                {renderPdfContent()}
            </div>

            {/* Bottom Control Bar */}
            <div style={{
                height: '80px',
                background: '#1e1e24',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 20px',
                gap: '20px',
                zIndex: 100
            }}>
                {showRecorder ? (
                    // --- Recorder Mode UI ---
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', width: '100%', justifyContent: 'space-between' }}>
                        {/* Left: Exit Recorder Mode */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <button
                                onClick={() => setShowRecorder(false)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'rgba(255,255,255,0.6)',
                                    cursor: 'pointer',
                                    fontSize: '1.2rem',
                                    padding: '8px',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s'
                                }}
                                title="Back to Player"
                            >
                                ✕
                            </button>
                            <div style={{ color: 'white', fontWeight: 600, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                🎙️ Recorder
                            </div>
                        </div>

                        {/* Center: Timer & Status */}
                        <div style={{
                            fontFamily: 'monospace',
                            fontSize: '1.5rem',
                            color: isRecording ? '#ef4444' : 'white',
                            fontWeight: 700,
                            minWidth: '80px',
                            textAlign: 'center'
                        }}>
                            {formatTime(recordingTime)}
                        </div>

                        {/* Right: Controls */}
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            {!isRecording && !audioBlob && (
                                <button
                                    onClick={startRecording}
                                    disabled={isAnalyzing}
                                    style={{
                                        background: '#ef4444',
                                        color: 'white',
                                        border: 'none',
                                        padding: '10px 24px',
                                        borderRadius: '24px',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        fontSize: '1rem'
                                    }}
                                >
                                    <span>●</span> Start Recording
                                </button>
                            )}

                            {isRecording && (
                                <button
                                    onClick={stopRecording}
                                    style={{
                                        background: 'rgba(255,255,255,0.1)',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        color: 'white',
                                        padding: '10px 24px',
                                        borderRadius: '24px',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        fontSize: '1rem'
                                    }}
                                >
                                    ⏹ Stop
                                </button>
                            )}

                            {!isRecording && audioBlob && (
                                <>
                                    <button
                                        onClick={handlePlayPreview}
                                        disabled={isPlayingPreview || isAnalyzing}
                                        style={{
                                            background: 'rgba(255,255,255,0.1)',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            color: 'white',
                                            padding: '8px 20px',
                                            borderRadius: '20px',
                                            cursor: 'pointer',
                                            fontSize: '0.9rem'
                                        }}
                                    >
                                        {isPlayingPreview ? '🔊 Playing...' : '▶ Preview'}
                                    </button>

                                    <button
                                        onClick={startRecording} // Re-record
                                        disabled={isAnalyzing}
                                        style={{
                                            background: 'transparent',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            color: 'rgba(255,255,255,0.7)',
                                            padding: '8px 20px',
                                            borderRadius: '20px',
                                            cursor: 'pointer',
                                            fontSize: '0.9rem'
                                        }}
                                    >
                                        Re-record
                                    </button>

                                    <button
                                        onClick={() => handleAnalysisStart(audioBlob)}
                                        disabled={isAnalyzing}
                                        style={{
                                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                            border: 'none',
                                            color: 'white',
                                            padding: '10px 24px',
                                            borderRadius: '24px',
                                            cursor: isAnalyzing ? 'wait' : 'pointer',
                                            fontWeight: 600,
                                            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
                                            fontSize: '1rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}
                                    >
                                        {isAnalyzing ? 'Analyzing...' : '✨ AI Feedback'}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                ) : (
                    // --- Player Mode UI (Original) ---
                    <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '12px' }}>
                        {/* Back button */}
                        <button
                            onClick={() => navigate(-1)}
                            style={{
                                background: 'var(--bg-primary)',
                                border: 'none',
                                borderRadius: '10px',
                                width: '40px',
                                height: '40px',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1.2rem',
                                transition: 'all 0.2s',
                                boxShadow: 'var(--shadow-neu-sm)'
                            }}
                        >
                            ←
                        </button>

                        {/* Title */}
                        <span style={{
                            color: 'white',
                            fontSize: '0.95rem',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '160px'
                        }}>
                            {book?.title || 'Loading...'}
                        </span>

                        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }} />

                        {/* Page Nav */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            background: 'var(--bg-primary)',
                            borderRadius: '12px',
                            padding: '6px 12px',
                            gap: '10px',
                            boxShadow: 'var(--shadow-neu-pressed)'
                        }}>
                            <button onClick={goToPrevPage} disabled={pageNumber <= 1} style={{ background: 'transparent', border: 'none', color: pageNumber <= 1 ? 'rgba(255,255,255,0.3)' : 'white', cursor: pageNumber <= 1 ? 'not-allowed' : 'pointer' }}>◀</button>
                            <span style={{ color: 'white', fontSize: '0.85rem' }}>{pageNumber} / {numPages}</span>
                            <button onClick={goToNextPage} disabled={pageNumber >= numPages} style={{ background: 'transparent', border: 'none', color: pageNumber >= numPages ? 'rgba(255,255,255,0.3)' : 'white', cursor: pageNumber >= numPages ? 'not-allowed' : 'pointer' }}>▶</button>
                        </div>

                        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }} />

                        {/* Play/Pause */}
                        <button
                            onClick={togglePlay}
                            disabled={!audioUrl}
                            style={{
                                background: audioUrl ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' : 'rgba(255,255,255,0.1)',
                                border: 'none',
                                borderRadius: '50%',
                                width: '36px',
                                height: '36px',
                                color: audioUrl ? 'white' : 'rgba(255,255,255,0.3)',
                                cursor: audioUrl ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            {isPlaying ? '⏸' : '▶'}
                        </button>

                        {/* Progress Bar Container - includes volume & time */}
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '4px' }}>
                            <div
                                onClick={handleProgressClick}
                                style={{
                                    height: '20px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    cursor: 'pointer'
                                }}
                            >
                                <div ref={progressBarRef} style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.15)', borderRadius: '2px', position: 'relative' }}>
                                    <div style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%', height: '100%', background: '#6366f1', borderRadius: '2px' }} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>
                                <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
                                {/* Speed */}
                                <button onClick={() => setShowSpeedMenu(!showSpeedMenu)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}>{playbackRate}x</button>
                                {showSpeedMenu && (
                                    <div style={{ position: 'absolute', bottom: '100%', right: '20px', background: '#1e1e24', padding: '10px', borderRadius: '8px', zIndex: 1000 }}>
                                        {speedOptions.map(rate => (
                                            <div key={rate} onClick={() => setSpeed(rate)} style={{ padding: '4px 8px', cursor: 'pointer', color: rate === playbackRate ? '#6366f1' : 'white' }}>{rate}x</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* View mode toggle */}
                        <button onClick={() => setViewMode(prev => prev === 'double' ? 'single' : 'double')} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '4px 8px', borderRadius: '4px', color: 'white', fontSize: '0.8rem', cursor: 'pointer' }}>
                            {isTwoPageMode ? '📖 Double' : '📄 Single'}
                        </button>

                        {/* Practice Mode Button */}
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                onClick={() => setShowRecorder(true)}
                                style={{
                                    background: 'rgba(255,255,255,0.08)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    color: 'white',
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <span>🎙️ Rec</span>
                            </button>

                            {/* Practice button */}
                            {practiceContent && (
                                <button
                                    onClick={() => {
                                        if (bookId) {
                                            window.open(`/practice/${level}/${bookId}`, '_blank');
                                        }
                                    }}
                                    style={{
                                        background: 'rgba(255,255,255,0.08)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        color: 'white',
                                        padding: '6px 12px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontSize: '0.9rem',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <span>🧠 Practice</span>
                                </button>
                            )}
                        </div>

                        {/* Mark complete status */}
                        {(() => {
                            const currentProgress = bookId ? getBookProgress(bookId) : undefined;
                            const hasRecorded = currentProgress?.hasRecorded;
                            const canComplete = hasRecorded && (!practiceContent || currentProgress?.hasPracticed);

                            return (
                                <button
                                    onClick={handleMarkComplete}
                                    disabled={!canComplete || isCompleted}
                                    style={{
                                        background: isCompleted ? '#059669' : canComplete ? 'rgba(255,255,255,0.15)' : 'transparent',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        padding: '6px',
                                        borderRadius: '8px',
                                        cursor: canComplete ? 'pointer' : 'default',
                                        color: canComplete ? 'white' : 'rgba(255,255,255,0.3)'
                                    }}
                                >
                                    {isCompleted ? '✓' : canComplete ? '📚' : '🔒'}
                                </button>
                            )
                        })()}
                    </div>
                )}
            </div>

            <audio
                ref={audioRef}
                src={audioUrl}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => setIsPlaying(false)}
            />



            {/* Analysis Result Modal */}
            {analysisResult && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.85)',
                    zIndex: 300,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '20px',
                    backdropFilter: 'blur(5px)'
                }}>
                    <div style={{
                        background: '#1e1e24',
                        padding: '0',
                        borderRadius: '24px',
                        maxWidth: '500px',
                        width: '100%',
                        border: '1px solid rgba(255,255,255,0.1)',
                        animation: 'fadeIn 0.3s ease',
                        overflow: 'hidden',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
                    }}>
                        {/* Header with Score */}
                        <div style={{
                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                            padding: '25px 30px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <h3 style={{ margin: 0, color: 'white', fontSize: '1.4rem' }}>🎉 Analysis Result</h3>
                                <div style={{ color: 'rgba(255,255,255,0.8)', marginTop: '4px', fontSize: '0.9rem' }}>Great job reading!</div>
                            </div>
                            <div style={{
                                background: 'rgba(255,255,255,0.2)',
                                backdropFilter: 'blur(10px)',
                                borderRadius: '16px',
                                padding: '8px 16px',
                                textAlign: 'center',
                                border: '1px solid rgba(255,255,255,0.3)'
                            }}>
                                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.9)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>Score</div>
                                <div style={{ fontSize: '1.8rem', color: 'white', fontWeight: 700, lineHeight: 1 }}>{analysisResult.score}</div>
                            </div>
                        </div>

                        {/* Content */}
                        <div style={{ padding: '30px' }}>
                            {/* Feedback Section */}
                            <div style={{ marginBottom: '25px' }}>
                                <h4 style={{ color: '#a5b4fc', margin: '0 0 10px 0', fontSize: '1rem' }}>📝 Feedback</h4>
                                <p style={{ color: 'rgba(255,255,255,0.9)', lineHeight: '1.6', fontSize: '1.05rem', margin: 0 }}>
                                    {analysisResult.feedback}
                                </p>
                            </div>

                            {/* Pronunciation Issues Section */}
                            {analysisResult.pronunciation_issues && analysisResult.pronunciation_issues.length > 0 && (
                                <div>
                                    <h4 style={{ color: '#fda4af', margin: '0 0 10px 0', fontSize: '1rem' }}>🎯 Words to Practice</h4>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {analysisResult.pronunciation_issues.map((word, idx) => (
                                            <span key={idx} style={{
                                                background: 'rgba(251, 113, 133, 0.15)',
                                                border: '1px solid rgba(251, 113, 133, 0.3)',
                                                color: '#fda4af',
                                                padding: '6px 14px',
                                                borderRadius: '20px',
                                                fontSize: '0.95rem',
                                                fontWeight: 500
                                            }}>
                                                {word}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={() => setAnalysisResult(null)}
                                style={{
                                    width: '100%',
                                    marginTop: '30px',
                                    padding: '14px',
                                    background: 'var(--bg-secondary)', // Fallback if var not set, will be dark
                                    backgroundColor: '#2d2d38',
                                    color: 'white',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '12px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    fontSize: '1rem',
                                    transition: 'background 0.2s'
                                }}
                                onMouseOver={(e) => e.currentTarget.style.background = '#3f3f4e'}
                                onMouseOut={(e) => e.currentTarget.style.background = '#2d2d38'}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ReaderPage;
