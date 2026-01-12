import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { type Book, API_BASE } from '../types';
import booksData from '../data/books.json';
import { useProgress } from '../contexts/ProgressContext';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

function ReaderPage() {
    const { level, bookId } = useParams<{ level: string; bookId: string }>();
    const navigate = useNavigate();
    const { getBookProgress, updateCurrentPage, addReadingTime, markAsCompleted } = useProgress();

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

        let finalIsTwoPage = false;
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

    // 翻页逻辑修正
    const goToPrevPage = () => {
        setPageNumber(p => {
            if (p <= 1) return 1;
            if (isTwoPageMode) {
                // 如果当前是偶数页(2,4...)，说明是左页，退回上一组
                // 如果是奇数页(3,5...)，说明是右页，退回该组左页？不对，UI上应该只有"上一屏"
                // 逻辑：
                // P2(2+3) -> Prev -> P1
                // P4(4+5) -> Prev -> P2(2+3)
                // P3(invalid state in spread) -> Prev -> P2?

                // 如果当前在封面(1)，无法前退
                if (p === 1) return 1;
                // 如果在 P2或P3，退到 P1
                if (p <= 3) return 1;

                // 其他情况，退 2 页
                // 确保对齐到偶数页
                const target = p % 2 === 0 ? p - 2 : p - 1 - 2;
                return Math.max(1, target);
            }
            return Math.max(1, p - 1);
        });
    };

    const goToNextPage = () => {
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
    };

    // 渲染辅助
    const renderPdfContent = () => {
        if (!pdfUrl) return null;

        // 计算要显示的页码
        // 单页模式：只显示 pageNumber
        // 双页模式：
        //   P1: 显示 P1 (居中)
        //   P > 1: 
        //     如果 pageNumber 是偶数 (2, 4...) -> 显示 P(左) + P+1(右)
        //     如果 pageNumber 是奇数 (3, 5...) -> 自动视为 P-1 的右页 -> 显示 P-1(左) + P(右)

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
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '0px', // 书籍通常没有缝隙，或者很小
                    boxShadow: isSpread ? '0 10px 30px rgba(0,0,0,0.5)' : 'none',
                    transition: 'all 0.3s ease'
                }}>
                    {/* 左页 (或单页) */}
                    <div style={{ position: 'relative' }}>
                        <Page
                            key={`page-${leftPage}-${containerSize.width}`}
                            pageNumber={leftPage}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                            onLoadSuccess={onPageLoadSuccess} // 只用左页触发 sizing 逻辑
                            width={pageDimension.width}
                            height={pageDimension.height}
                            loading={
                                <div style={{
                                    width: pageDimension.width || 300,
                                    height: pageDimension.height || 400,
                                    background: 'rgba(255,255,255,0.05)'
                                }} />
                            }
                            className={isSpread ? "pdf-page-left" : "pdf-page-single"}
                        />
                        {/* 阴影效果: 书脊 */}
                        {isSpread && (
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                right: 0,
                                bottom: 0,
                                width: '30px',
                                background: 'linear-gradient(to right, transparent, rgba(0,0,0,0.15))',
                                pointerEvents: 'none',
                                zIndex: 10
                            }} />
                        )}
                    </div>

                    {/* 右页 */}
                    {isSpread && rightPage && (
                        <div style={{ position: 'relative' }}>
                            <Page
                                key={`page-${rightPage}-${containerSize.width}`}
                                pageNumber={rightPage}
                                renderTextLayer={false}
                                renderAnnotationLayer={false}
                                // 右页不需要触发 sizing，跟随左页即可
                                width={pageDimension.width}
                                height={pageDimension.height}
                                loading={
                                    <div style={{
                                        width: pageDimension.width || 300,
                                        height: pageDimension.height || 400,
                                        background: 'rgba(255,255,255,0.05)'
                                    }} />
                                }
                                className="pdf-page-right"
                            />
                            {/* 阴影效果: 书脊 */}
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                bottom: 0,
                                width: '30px',
                                background: 'linear-gradient(to left, transparent, rgba(0,0,0,0.15))',
                                pointerEvents: 'none',
                                zIndex: 10
                            }} />
                        </div>
                    )}
                </div>
            </Document>
        );
    };

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

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
        const rect = e.currentTarget.getBoundingClientRect();
        // 进度条区域有 12px 左右 padding，需要减去
        const padding = 12;
        const x = e.clientX - rect.left - padding;
        const trackWidth = rect.width - (padding * 2);
        const percentage = Math.max(0, Math.min(1, x / trackWidth));
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
    }, [numPages, isPlaying]);

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
                style={{
                    flex: 1,
                    background: 'var(--bg-secondary)',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
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

            {/* 美化版控制栏 */}
            <div style={{
                background: 'linear-gradient(180deg, rgba(20,20,25,0.95) 0%, rgba(10,10,15,0.98) 100%)',
                borderRadius: '12px',
                overflow: 'visible',
                position: 'relative',
                zIndex: 100,
                boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.08)'
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

                {/* 控制按钮行 */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 12px 10px',
                    gap: '12px'
                }}>
                    {/* 返回按钮 */}
                    <button
                        onClick={() => navigate(-1)}
                        style={{
                            background: 'rgba(255,255,255,0.08)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            width: '32px',
                            height: '32px',
                            color: 'white',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1rem',
                            transition: 'all 0.2s'
                        }}
                    >
                        ←
                    </button>

                    {/* 标题 */}
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

                    {/* 分隔符 */}
                    <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }} />

                    {/* 翻页控制 */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: '8px',
                        padding: '4px 8px',
                        gap: '8px'
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
                                    播放速度
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
                                        <span>{rate === 1.0 ? '正常' : `${rate}x`}</span>
                                        {playbackRate === rate && <span style={{ color: '#6366f1' }}>✓</span>}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 页面模式切换 */}
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
                        {isTwoPageMode ? '📖 双页' : '📄 单页'}
                    </button>

                    {/* 标记完成按钮 */}
                    <button
                        onClick={handleMarkComplete}
                        disabled={isCompleted}
                        title={isCompleted ? '已完成' : '标记为已学习'}
                        style={{
                            background: isCompleted
                                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                                : 'rgba(255,255,255,0.08)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            color: 'white',
                            cursor: isCompleted ? 'default' : 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.2s'
                        }}
                    >
                        {isCompleted ? '✓ 已完成' : '📚 标记完成'}
                    </button>
                </div>
            </div>

            <audio
                ref={audioRef}
                src={audioUrl}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => setIsPlaying(false)}
            />
        </div>
    );
}

export default ReaderPage;
