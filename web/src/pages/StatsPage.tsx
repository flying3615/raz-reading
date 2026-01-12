import { useProgress } from '../contexts/ProgressContext';
import { Link } from 'react-router-dom';
import booksData from '../data/books.json';

// 所有等级
const LEVELS = ['AA', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'Z1', 'Z2'];

function formatTime(seconds: number): string {
    if (seconds < 60) return `${seconds}秒`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分钟`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}小时${remainingMinutes > 0 ? ` ${remainingMinutes}分钟` : ''}`;
}

function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString('zh-CN');
}

function StatsPage() {
    const { progress, getRecentBooks, resetProgress } = useProgress();
    const allBooks = booksData as unknown as Record<string, { id: string; title: string }[]>;

    // 计算总体统计
    const totalBooks = Object.values(progress.books).length;
    const completedBooks = Object.values(progress.books).filter(b => b.status === 'completed').length;
    const readingBooks = Object.values(progress.books).filter(b => b.status === 'reading').length;

    // 按等级统计
    const levelStats = LEVELS.map(level => {
        const totalInLevel = allBooks[level]?.length || 0;
        const booksInLevel = Object.values(progress.books).filter(b => b.level === level);
        const completed = booksInLevel.filter(b => b.status === 'completed').length;
        const reading = booksInLevel.filter(b => b.status === 'reading').length;
        return { level, totalInLevel, completed, reading };
    }).filter(s => s.totalInLevel > 0);

    const recentBooks = getRecentBooks(5);

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
            <h1 style={{
                fontSize: '1.8rem',
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
            }}>
                📊 我的阅读统计
            </h1>

            {/* 总体统计卡片 */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '16px',
                marginBottom: '32px'
            }}>
                <div style={{
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    borderRadius: '12px',
                    padding: '20px',
                    color: 'white'
                }}>
                    <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>总阅读时长</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px' }}>
                        {formatTime(progress.totalReadingTime)}
                    </div>
                </div>

                <div style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    borderRadius: '12px',
                    padding: '20px',
                    color: 'white'
                }}>
                    <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>已完成</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px' }}>
                        {completedBooks} 本
                    </div>
                </div>

                <div style={{
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    borderRadius: '12px',
                    padding: '20px',
                    color: 'white'
                }}>
                    <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>阅读中</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px' }}>
                        {readingBooks} 本
                    </div>
                </div>

                <div style={{
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    borderRadius: '12px',
                    padding: '20px',
                    color: 'white'
                }}>
                    <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>总阅读</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px' }}>
                        {totalBooks} 本
                    </div>
                </div>
            </div>

            {/* 等级进度 */}
            <div style={{
                background: 'var(--bg-secondary)',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '24px'
            }}>
                <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>📚 等级进度</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {levelStats.map(({ level, totalInLevel, completed, reading }) => {
                        const percentage = totalInLevel > 0 ? Math.round((completed / totalInLevel) * 100) : 0;
                        const isComplete = completed === totalInLevel && totalInLevel > 0;

                        return (
                            <Link
                                key={level}
                                to={`/level/${level}`}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    textDecoration: 'none',
                                    color: 'inherit'
                                }}
                            >
                                <span style={{
                                    width: '36px',
                                    fontWeight: 600,
                                    color: isComplete ? '#10b981' : 'var(--text-primary)'
                                }}>
                                    {level}
                                </span>
                                <div style={{
                                    flex: 1,
                                    height: '8px',
                                    background: 'rgba(255,255,255,0.1)',
                                    borderRadius: '4px',
                                    overflow: 'hidden'
                                }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${percentage}%`,
                                        background: isComplete
                                            ? 'linear-gradient(90deg, #10b981, #059669)'
                                            : 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                                        borderRadius: '4px',
                                        transition: 'width 0.3s'
                                    }} />
                                </div>
                                <span style={{
                                    fontSize: '0.85rem',
                                    color: 'var(--text-secondary)',
                                    minWidth: '80px',
                                    textAlign: 'right'
                                }}>
                                    {completed}/{totalInLevel}
                                    {reading > 0 && <span style={{ color: '#f59e0b' }}> (+{reading})</span>}
                                    {isComplete && ' ✓'}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </div>

            {/* 最近阅读 */}
            {recentBooks.length > 0 && (
                <div style={{
                    background: 'var(--bg-secondary)',
                    borderRadius: '12px',
                    padding: '20px',
                    marginBottom: '24px'
                }}>
                    <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>📖 最近阅读</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {recentBooks.map(book => (
                            <Link
                                key={book.bookId}
                                to={`/read/${book.level}/${book.bookId}`}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '12px',
                                    background: 'rgba(255,255,255,0.05)',
                                    borderRadius: '8px',
                                    textDecoration: 'none',
                                    color: 'inherit'
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 500 }}>
                                        {book.status === 'completed' && '✓ '}
                                        {book.title}
                                    </div>
                                    <div style={{
                                        fontSize: '0.8rem',
                                        color: 'var(--text-secondary)',
                                        marginTop: '2px'
                                    }}>
                                        Level {book.level} ·
                                        {book.totalPages > 0 ? ` ${book.currentPage}/${book.totalPages}页 · ` : ' '}
                                        {formatTime(book.readingTime)}
                                    </div>
                                </div>
                                <span style={{
                                    fontSize: '0.8rem',
                                    color: 'var(--text-secondary)'
                                }}>
                                    {formatRelativeTime(book.lastReadAt)}
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* 重置按钮 */}
            {totalBooks > 0 && (
                <div style={{ textAlign: 'center', marginTop: '32px' }}>
                    <button
                        onClick={() => {
                            if (confirm('确定要重置所有阅读进度吗？此操作不可撤销！')) {
                                resetProgress();
                            }
                        }}
                        style={{
                            background: 'transparent',
                            border: '1px solid rgba(239, 68, 68, 0.5)',
                            color: '#ef4444',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '0.85rem'
                        }}
                    >
                        重置所有进度
                    </button>
                </div>
            )}

            {/* 空状态 */}
            {totalBooks === 0 && (
                <div style={{
                    textAlign: 'center',
                    padding: '60px 20px',
                    color: 'var(--text-secondary)'
                }}>
                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📖</div>
                    <div style={{ fontSize: '1.1rem', marginBottom: '8px' }}>还没有阅读记录</div>
                    <div style={{ fontSize: '0.9rem' }}>开始阅读第一本书吧！</div>
                    <Link
                        to="/"
                        style={{
                            display: 'inline-block',
                            marginTop: '20px',
                            padding: '10px 20px',
                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                            color: 'white',
                            borderRadius: '8px',
                            textDecoration: 'none'
                        }}
                    >
                        浏览书籍
                    </Link>
                </div>
            )}
        </div>
    );
}

export default StatsPage;
