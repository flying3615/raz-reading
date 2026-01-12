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

    const onPageLoadSuccess = useCallback(({ originalWidth, originalHeight }: { originalWidth: number; originalHeight: number }) => {
        if (!containerSize.width || !containerSize.height) return;
        const padding = 8;
        const availableWidth = containerSize.width - padding;
        const availableHeight = containerSize.height - padding;
        const scaleW = availableWidth / originalWidth;
        const scaleH = availableHeight / originalHeight;
        if (scaleW < scaleH) {
            setPageDimension({ width: availableWidth });
        } else {
            setPageDimension({ height: availableHeight });
        }
    }, [containerSize]);

    useEffect(() => {
        setPageDimension({});
    }, [containerSize, pageNumber]);

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

    const goToPrevPage = () => setPageNumber(p => Math.max(1, p - 1));
    const goToNextPage = () => setPageNumber(p => Math.min(numPages, p + 1));

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
                {pdfUrl && (
                    <Document
                        file={pdfUrl}
                        onLoadSuccess={onDocumentLoadSuccess}
                        onLoadError={onDocumentLoadError}
                        loading={null}
                    >
                        <Page
                            key={`${pageNumber}-${containerSize.width}`}
                            pageNumber={pageNumber}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                            onLoadSuccess={onPageLoadSuccess}
                            width={pageDimension.width}
                            height={pageDimension.height || (pageDimension.width ? undefined : (containerSize.height ? containerSize.height - 8 : 600))}
                            loading={null}
                        />
                    </Document>
                )}
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
