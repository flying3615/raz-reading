import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { type Book, API_BASE } from '../types';
import booksData from '../data/books.json';
import { useProgress } from '../contexts/ProgressContext';
import { AudioRecorder } from '../components/AudioRecorder';
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
        markPracticed,
        getBookProgress
    } = useProgress();

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
    const [volume, setVolume] = useState(1);
    const [playbackRate, setPlaybackRate] = useState(1.0);
    const [showSpeedMenu, setShowSpeedMenu] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);

    const [book, setBook] = useState<Book | null>(null);
    const [isCompleted, setIsCompleted] = useState(false);
    const [viewMode, setViewMode] = useState<'auto' | 'single' | 'double'>('auto');
    const [isTwoPageMode, setIsTwoPageMode] = useState(false);

    // Recording & Analysis State
    const [showRecorder, setShowRecorder] = useState(false);
    const [recorderPos, setRecorderPos] = useState<'bottom' | 'top'>('bottom');
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const [analysisResult, setAnalysisResult] = useState<{ score: number; feedback: string } | null>(null);

    // Practice Content State
    const [practiceContent, setPracticeContent] = useState<{ quiz: any[], vocabulary: any[], discussion?: any[] } | null>(null);
    const [showPractice, setShowPractice] = useState(false);

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

    const handleAnalysisStart = async (audioBlob: Blob) => {
        setIsAnalyzing(true);
        try {
            const formData = new FormData();
            formData.append('audio', audioBlob);

            const response = await fetch(`${API_BASE}/analyze-reading`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Analysis request failed');
            }

            const result = await response.json();
            setAnalysisResult({
                score: result.score,
                feedback: result.feedback
            });

            // Mark as recorded when analysis is successful
            if (bookId) {
                markRecorded(bookId);
            }
        } catch (error) {
            console.error('Analysis failed:', error);
            alert('Oh no! Analysis failed. Please try again.');
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

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!audioRef.current || !duration) return;

        // Get the track element directly by finding the element with flex: 1
        const container = e.currentTarget;
        const trackElement = container.firstElementChild as HTMLDivElement;
        if (!trackElement) return;

        const rect = trackElement.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, x / rect.width));
        audioRef.current.currentTime = percentage * duration;
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVolume = parseFloat(e.target.value);
        setVolume(newVolume);
        if (audioRef.current) {
            audioRef.current.volume = newVolume;
        }
    };

    const setSpeed = (rate: number) => {
        setPlaybackRate(rate);
        if (audioRef.current) {
            audioRef.current.playbackRate = rate;
        }
        setShowSpeedMenu(false);
    };

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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

            {/* 美化版控制栏 - Neumorphic Style */}
            <div style={{
                background: 'var(--bg-primary)',
                borderRadius: '20px', // More rounded for Neumorphism
                overflow: 'visible',
                position: 'relative',
                zIndex: 100,
                boxShadow: 'var(--shadow-neu-flat)', // Neumorphic float
                border: '1px solid rgba(255,255,255,0.02)',
                marginTop: '1rem',
                marginBottom: '0.5rem'
            }}>
                {/* 进度条区域 - 增大点击区域 */}
                <div
                    onClick={handleProgressClick}
                    style={{
                        height: '16px',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center'
                    }}
                >
                    <div style={{
                        flex: 1,
                        height: '4px',
                        background: 'rgba(255,255,255,0.15)',
                        borderRadius: '2px',
                        position: 'relative',
                        overflow: 'visible'
                    }}>
                        {/* 已播放进度 */}
                        <div style={{
                            height: '100%',
                            background: 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%)',
                            borderRadius: '2px',
                            width: duration ? `${(currentTime / duration) * 100}%` : '0%',
                            transition: 'width 0.1s linear',
                            boxShadow: '0 0 8px rgba(99, 102, 241, 0.5)'
                        }} />
                        {/* 拖动圆点 */}
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            left: duration ? `calc(${(currentTime / duration) * 100}% - 7px)` : '-7px',
                            width: '14px',
                            height: '14px',
                            background: 'white',
                            borderRadius: '50%',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                            transition: 'left 0.1s linear'
                        }} />
                    </div>
                </div>

                {/* Control buttons row */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 12px 10px',
                    gap: '12px'
                }}>
                    {/* Back button */}
                    <button
                        onClick={() => navigate(-1)}
                        style={{
                            background: 'var(--bg-primary)',
                            border: 'none',
                            borderRadius: '10px',
                            width: '40px', // Slightly larger
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

                    {/* Separator */}
                    <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }} />

                    {/* Page navigation controls */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        background: 'var(--bg-primary)',
                        borderRadius: '12px',
                        padding: '6px 12px',
                        gap: '10px',
                        boxShadow: 'var(--shadow-neu-pressed)'
                    }}>
                        <button
                            onClick={goToPrevPage}
                            disabled={pageNumber <= 1}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: pageNumber <= 1 ? 'rgba(255,255,255,0.3)' : 'white',
                                cursor: pageNumber <= 1 ? 'not-allowed' : 'pointer',
                                fontSize: '0.9rem',
                                padding: '2px 6px'
                            }}
                        >
                            ◀
                        </button>
                        <span style={{
                            color: 'white',
                            fontSize: '0.85rem',
                            fontWeight: 500,
                            minWidth: '42px',
                            textAlign: 'center'
                        }}>
                            {pageNumber} / {numPages}
                        </span>
                        <button
                            onClick={goToNextPage}
                            disabled={pageNumber >= numPages}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: pageNumber >= numPages ? 'rgba(255,255,255,0.3)' : 'white',
                                cursor: pageNumber >= numPages ? 'not-allowed' : 'pointer',
                                fontSize: '0.9rem',
                                padding: '2px 6px'
                            }}
                        >
                            ▶
                        </button>
                    </div>

                    {/* 分隔符 */}
                    <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }} />

                    {/* 播放/暂停 */}
                    <button
                        onClick={togglePlay}
                        disabled={!audioUrl}
                        title={!audioUrl ? '此书籍暂无音频' : undefined}
                        style={{
                            background: audioUrl
                                ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                                : 'rgba(255,255,255,0.1)',
                            border: 'none',
                            borderRadius: '50%',
                            width: '36px',
                            height: '36px',
                            color: audioUrl ? 'white' : 'rgba(255,255,255,0.3)',
                            cursor: audioUrl ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1rem',
                            boxShadow: audioUrl ? '0 2px 10px rgba(99, 102, 241, 0.4)' : 'none',
                            transition: 'transform 0.2s'
                        }}
                    >
                        {isPlaying ? '⏸' : '▶'}
                    </button>

                    {/* 音量 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>🔊</span>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={volume}
                            onChange={handleVolumeChange}
                            style={{
                                width: '50px',
                                height: '4px',
                                accentColor: '#6366f1',
                                cursor: 'pointer'
                            }}
                        />
                    </div>

                    {/* 时间 */}
                    <div style={{
                        color: 'rgba(255,255,255,0.6)',
                        fontSize: '0.8rem',
                        fontFamily: 'monospace'
                    }}>
                        {formatTime(currentTime)} / {formatTime(duration)}
                    </div>

                    {/* 弹性空间 */}
                    <div style={{ flex: 1 }} />

                    {/* 倍速 */}
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowSpeedMenu(!showSpeedMenu); }}
                            style={{
                                background: playbackRate !== 1.0 ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255,255,255,0.08)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: 'white',
                                padding: '5px 10px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                fontWeight: 500,
                                transition: 'all 0.2s'
                            }}
                        >
                            {playbackRate}x
                        </button>

                        {showSpeedMenu && (
                            <div
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    position: 'absolute',
                                    bottom: '100%',
                                    right: 0,
                                    marginBottom: '10px',
                                    background: 'rgba(20, 20, 25, 0.98)',
                                    borderRadius: '10px',
                                    padding: '8px 0',
                                    minWidth: '110px',
                                    boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    zIndex: 1000
                                }}
                            >
                                <div style={{
                                    padding: '6px 14px 8px',
                                    color: 'rgba(255,255,255,0.5)',
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                    borderBottom: '1px solid rgba(255,255,255,0.08)'
                                }}>
                                    Playback Speed
                                </div>
                                {speedOptions.map(rate => (
                                    <button
                                        key={rate}
                                        onClick={() => setSpeed(rate)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            width: '100%',
                                            padding: '8px 14px',
                                            background: playbackRate === rate ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                                            border: 'none',
                                            color: playbackRate === rate ? '#a5b4fc' : 'white',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            transition: 'background 0.15s'
                                        }}
                                    >
                                        <span>{rate === 1.0 ? 'Normal' : `${rate}x`}</span>
                                        {playbackRate === rate && <span style={{ color: '#6366f1' }}>✓</span>}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* View mode toggle */}
                    <button
                        onClick={() => setViewMode(prev => prev === 'double' ? 'single' : 'double')}
                        style={{
                            background: viewMode !== 'auto' ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255,255,255,0.08)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'white',
                            padding: '5px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.2s'
                        }}
                    >
                        {isTwoPageMode ? '📖 Double' : '📄 Single'}
                    </button>

                    {/* Practice Mode Button */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={() => setShowRecorder(!showRecorder)}
                            style={{
                                background: showRecorder ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.08)',
                                border: showRecorder ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255,255,255,0.1)',
                                color: showRecorder ? '#fca5a5' : 'white',
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
                            <span>🎙️ Recording</span>
                        </button>

                        {/* Practice button */}
                        {practiceContent && (
                            <button
                                onClick={() => {
                                    setShowPractice(!showPractice);
                                    if (bookId && !showPractice) {
                                        markPracticed(bookId);
                                    }
                                }}
                                style={{
                                    background: showPractice ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.08)',
                                    border: showPractice ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(255,255,255,0.1)',
                                    color: showPractice ? '#6ee7b7' : 'white',
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

                    {/* Mark complete button */}
                    {(() => {
                        const currentProgress = bookId ? getBookProgress(bookId) : undefined;
                        const hasRecorded = currentProgress?.hasRecorded;
                        const hasPracticed = currentProgress?.hasPracticed;
                        const hasQuizContent = !!practiceContent;

                        // Condition: Must record. If quiz content exists, must also practice.
                        const canComplete = hasRecorded && (!hasQuizContent || hasPracticed);

                        return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {/* Status Indicators */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.6rem', color: 'rgba(255,255,255,0.6)', marginRight: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: hasRecorded ? 1 : 0.5 }}>
                                        <span>🎙️</span> {hasRecorded ? 'Done' : 'ToDo'}
                                    </div>
                                    {hasQuizContent && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: hasPracticed ? 1 : 0.5 }}>
                                            <span>🧠</span> {hasPracticed ? 'Done' : 'ToDo'}
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={handleMarkComplete}
                                    disabled={!canComplete || isCompleted}
                                    title={
                                        isCompleted ? 'Completed' :
                                            !canComplete ? 'Complete Recording & Practice to unlock' :
                                                'Mark as completed'
                                    }
                                    style={{
                                        background: isCompleted
                                            ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                                            : canComplete
                                                ? 'rgba(255,255,255,0.15)'
                                                : 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '8px',
                                        padding: '6px 12px',
                                        color: canComplete ? 'white' : 'rgba(255,255,255,0.3)',
                                        cursor: (canComplete && !isCompleted) ? 'pointer' : 'default',
                                        fontSize: '0.8rem',
                                        fontWeight: 500,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {isCompleted ? '✓ Completed' : canComplete ? '📚 Mark Complete' : '🔒 Locked'}
                                </button>
                            </div>
                        );
                    })()}
                </div>
            </div>

            <audio
                ref={audioRef}
                src={audioUrl}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => setIsPlaying(false)}
            />

            {/* Recording Modal/Overlay */}
            {/* Recording Modal/Overlay */}
            {showRecorder && (
                <div style={{
                    position: 'absolute',
                    bottom: recorderPos === 'bottom' ? '80px' : 'auto',
                    top: recorderPos === 'top' ? '80px' : 'auto',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 200,
                    width: '90%',
                    maxWidth: '400px',
                    transition: 'all 0.3s ease'
                }}>
                    {/* Position Toggle Button */}
                    <button
                        onClick={() => setRecorderPos(p => p === 'bottom' ? 'top' : 'bottom')}
                        style={{
                            position: 'absolute',
                            right: '10px',
                            top: '-30px',
                            background: 'rgba(0,0,0,0.6)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: 'white',
                            borderRadius: '20px',
                            padding: '4px 12px',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            zIndex: 210,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            backdropFilter: 'blur(4px)'
                        }}
                    >
                        {recorderPos === 'bottom' ? '⬆️ Move Top' : '⬇️ Move Bottom'}
                    </button>

                    <AudioRecorder
                        onAnalysisStart={handleAnalysisStart}
                        isAnalyzing={isAnalyzing}
                    />
                </div>
            )}

            {/* Practice Content Modal */}
            {showPractice && practiceContent && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 300,
                    background: 'rgba(0,0,0,0.85)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    backdropFilter: 'blur(5px)'
                }}>
                    <div style={{
                        background: '#1e1e24',
                        width: '90%',
                        maxWidth: '800px',
                        height: '80vh',
                        borderRadius: '20px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            padding: '20px',
                            borderBottom: '1px solid rgba(255,255,255,0.1)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <h2 style={{ margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                🧠 Practice Mode
                            </h2>
                            <button
                                onClick={() => setShowPractice(false)}
                                style={{
                                    background: 'rgba(255,255,255,0.1)',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '32px',
                                    height: '32px',
                                    color: 'white',
                                    cursor: 'pointer'
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', gap: '20px', flexDirection: 'column' }}>
                            {/* Stats / Vocab Section */}
                            <div>
                                <h3 style={{ color: '#a5b4fc', marginBottom: '15px' }}>📚 Key Vocabulary</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                                    {practiceContent.vocabulary.map((vocab, idx) => (
                                        <div key={idx} style={{
                                            background: 'rgba(255,255,255,0.05)',
                                            padding: '15px',
                                            borderRadius: '12px',
                                            border: '1px solid rgba(255,255,255,0.05)'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                                                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'white' }}>{vocab.word}</div>
                                                {vocab.partOfSpeech && (
                                                    <span style={{
                                                        background: 'rgba(255,255,255,0.1)',
                                                        color: '#e2e8f0',
                                                        fontSize: '0.7rem',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px',
                                                        fontFamily: 'monospace'
                                                    }}>
                                                        {vocab.partOfSpeech}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ color: '#a5b4fc', fontSize: '0.95rem', lineHeight: '1.4', marginBottom: vocab.example ? '8px' : '0' }}>
                                                {vocab.definition}
                                            </div>
                                            {vocab.example && (
                                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', fontStyle: 'italic', paddingLeft: '8px', borderLeft: '2px solid rgba(255,255,255,0.1)' }}>
                                                    "{vocab.example}"
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Quiz Section */}
                            <div>
                                <h3 style={{ color: '#fda4af', marginBottom: '15px' }}>📝 Quick Quiz</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    {practiceContent.quiz.map((q, idx) => (
                                        <div key={idx} style={{
                                            background: 'rgba(255,255,255,0.03)',
                                            padding: '20px',
                                            borderRadius: '12px',
                                            border: '1px solid rgba(255,255,255,0.05)'
                                        }}>
                                            <div style={{ color: 'white', fontWeight: 600, marginBottom: '15px' }}>
                                                {idx + 1}. {q.question}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {q.options.map((opt: string, optIdx: number) => (
                                                    <button
                                                        key={optIdx}
                                                        onClick={(e) => {
                                                            const btn = e.currentTarget;
                                                            if (optIdx === q.correctAnswer) {
                                                                btn.style.background = 'rgba(16, 185, 129, 0.2)';
                                                                btn.style.borderColor = '#10b981';
                                                            } else {
                                                                btn.style.background = 'rgba(239, 68, 68, 0.2)';
                                                                btn.style.borderColor = '#ef4444';
                                                            }
                                                        }}
                                                        style={{
                                                            textAlign: 'left',
                                                            padding: '12px',
                                                            background: 'rgba(255,255,255,0.05)',
                                                            border: '1px solid rgba(255,255,255,0.1)',
                                                            borderRadius: '8px',
                                                            color: 'rgba(255,255,255,0.8)',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        {['A', 'B', 'C'][optIdx]}. {opt}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Discussion Section */}
                        {practiceContent.discussion && practiceContent.discussion.length > 0 && (
                            <div style={{ marginTop: '30px', paddingBottom: '20px' }}>
                                <h3 style={{ color: '#c084fc', marginBottom: '15px' }}>🗣️ Discussion</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    {practiceContent.discussion.map((item, idx) => (
                                        <div key={idx} style={{
                                            background: 'rgba(255,255,255,0.05)',
                                            padding: '20px',
                                            borderRadius: '16px',
                                            border: '1px solid rgba(255,255,255,0.05)'
                                        }}>
                                            <div style={{
                                                fontSize: '1.1rem',
                                                color: 'white',
                                                marginBottom: '15px',
                                                lineHeight: '1.5',
                                                display: 'flex',
                                                gap: '10px'
                                            }}>
                                                <span style={{ fontSize: '1.4rem' }}>🤔</span>
                                                {item.question}
                                            </div>

                                            <details style={{
                                                marginTop: '10px',
                                                borderTop: '1px solid rgba(255,255,255,0.1)',
                                                paddingTop: '10px'
                                            }}>
                                                <summary style={{
                                                    cursor: 'pointer',
                                                    color: '#c084fc',
                                                    fontWeight: 500,
                                                    outline: 'none',
                                                    listStyle: 'none', // helps hide default arrow in some browsers
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px'
                                                }}>
                                                    👀 Reveal Analysis
                                                </summary>
                                                <div style={{
                                                    marginTop: '10px',
                                                    color: 'rgba(255,255,255,0.7)',
                                                    fontSize: '0.95rem',
                                                    lineHeight: '1.6',
                                                    background: 'rgba(192, 132, 252, 0.1)',
                                                    padding: '12px',
                                                    borderRadius: '8px'
                                                }}>
                                                    {item.analysis}
                                                </div>
                                            </details>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Analysis Result Modal */}
            {analysisResult && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.8)',
                    zIndex: 300,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '20px'
                }}>
                    <div style={{
                        background: '#1e1e24',
                        padding: '24px',
                        borderRadius: '16px',
                        maxWidth: '500px',
                        width: '100%',
                        border: '1px solid rgba(255,255,255,0.1)',
                        animation: 'fadeIn 0.3s ease'
                    }}>
                        <h3 style={{ marginTop: 0, color: 'white', display: 'flex', justifyContent: 'space-between' }}>
                            <span>🎉 Analysis Content</span>
                            <span style={{ color: '#8b5cf6' }}>Score: {analysisResult.score}</span>
                        </h3>
                        <p style={{ color: 'rgba(255,255,255,0.8)', lineHeight: '1.6' }}>
                            {analysisResult.feedback}
                        </p>
                        <button
                            onClick={() => setAnalysisResult(null)}
                            style={{
                                width: '100%',
                                marginTop: '20px',
                                padding: '12px',
                                background: 'white',
                                color: 'black',
                                border: 'none',
                                borderRadius: '8px',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ReaderPage;
