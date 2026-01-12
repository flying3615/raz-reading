import { Link } from 'react-router-dom';
import { useState } from 'react';
import { type Level } from '../types';
import { useProgress } from '../contexts/ProgressContext';

// 预定义的级别数据（静态化，避免首页 API 调用）
const LEVELS: Level[] = [
    { id: 'AA', name: 'AA', bookCount: 100 },
    { id: 'A', name: 'A', bookCount: 99 },
    { id: 'B', name: 'B', bookCount: 99 },
    { id: 'C', name: 'C', bookCount: 100 },
    { id: 'D', name: 'D', bookCount: 90 },
    { id: 'E', name: 'E', bookCount: 82 },
    { id: 'F', name: 'F', bookCount: 81 },
    { id: 'G', name: 'G', bookCount: 82 },
    { id: 'H', name: 'H', bookCount: 71 },
    { id: 'I', name: 'I', bookCount: 71 },
    { id: 'J', name: 'J', bookCount: 76 },
    { id: 'K', name: 'K', bookCount: 75 },
    { id: 'L', name: 'L', bookCount: 73 },
    { id: 'M', name: 'M', bookCount: 71 },
    { id: 'N', name: 'N', bookCount: 73 },
    { id: 'O', name: 'O', bookCount: 72 },
    { id: 'P', name: 'P', bookCount: 71 },
    { id: 'Q', name: 'Q', bookCount: 78 },
    { id: 'R', name: 'R', bookCount: 85 },
    { id: 'S', name: 'S', bookCount: 73 },
    { id: 'T', name: 'T', bookCount: 68 },
    { id: 'U', name: 'U', bookCount: 75 },
    { id: 'V', name: 'V', bookCount: 66 },
    { id: 'W', name: 'W', bookCount: 65 },
    { id: 'X', name: 'X', bookCount: 73 },
    { id: 'Y', name: 'Y', bookCount: 87 },
    { id: 'Z', name: 'Z', bookCount: 74 },
    { id: 'Z1', name: 'Z1', bookCount: 83 },
    { id: 'Z2', name: 'Z2', bookCount: 86 },
];

function formatTime(seconds: number): string {
    if (seconds < 60) return `${seconds}秒`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分钟`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}小时${remainingMinutes > 0 ? `${remainingMinutes}分` : ''}`;
}

function HomePage() {
    const [levels] = useState<Level[]>(LEVELS);
    const { progress, getRecentBooks, getLevelStats } = useProgress();

    // 计算总书数
    const totalBooks = levels.reduce((sum, l) => sum + l.bookCount, 0);
    const completedBooks = Object.values(progress.books).filter(b => b.status === 'completed').length;
    const recentBooks = getRecentBooks(3);

    return (
        <div>
            <section className="hero">
                <h1 className="hero-title">RAZ 分级阅读</h1>
                <p className="hero-subtitle">
                    探索从 AA 到 Z2 的英语分级阅读材料，边看边听，提升英语阅读能力
                </p>
                <div className="hero-stats">
                    <div className="stat-item">
                        <div className="stat-value">{levels.length}</div>
                        <div className="stat-label">阅读级别</div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-value">{totalBooks}</div>
                        <div className="stat-label">绘本数量</div>
                    </div>
                    {progress.totalReadingTime > 0 ? (
                        <div className="stat-item">
                            <div className="stat-value">{formatTime(progress.totalReadingTime)}</div>
                            <div className="stat-label">已阅读</div>
                        </div>
                    ) : (
                        <div className="stat-item">
                            <div className="stat-value">20GB+</div>
                            <div className="stat-label">音频资源</div>
                        </div>
                    )}
                    {completedBooks > 0 && (
                        <div className="stat-item">
                            <div className="stat-value" style={{ color: '#10b981' }}>{completedBooks}</div>
                            <div className="stat-label">已完成</div>
                        </div>
                    )}
                </div>
            </section>

            {/* 继续阅读 */}
            {recentBooks.length > 0 && (
                <section style={{ marginBottom: '2rem' }}>
                    <h2 style={{
                        marginBottom: '1rem',
                        fontSize: '1.2rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <span>📖 继续阅读</span>
                        <Link to="/stats" style={{
                            fontSize: '0.9rem',
                            color: 'var(--primary)',
                            textDecoration: 'none'
                        }}>
                            查看统计 →
                        </Link>
                    </h2>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                        gap: '12px'
                    }}>
                        {recentBooks.map(book => (
                            <Link
                                key={book.bookId}
                                to={`/read/${book.level}/${book.bookId}`}
                                style={{
                                    background: 'var(--bg-secondary)',
                                    borderRadius: '10px',
                                    padding: '14px',
                                    textDecoration: 'none',
                                    color: 'inherit',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '8px',
                                    border: book.status === 'completed'
                                        ? '1px solid rgba(16, 185, 129, 0.3)'
                                        : '1px solid rgba(255,255,255,0.05)'
                                }}
                            >
                                <div style={{
                                    fontWeight: 600,
                                    fontSize: '0.95rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}>
                                    {book.status === 'completed' && <span style={{ color: '#10b981' }}>✓</span>}
                                    {book.title}
                                </div>
                                <div style={{
                                    fontSize: '0.8rem',
                                    color: 'var(--text-secondary)',
                                    display: 'flex',
                                    justifyContent: 'space-between'
                                }}>
                                    <span>Level {book.level}</span>
                                    {book.totalPages > 0 && (
                                        <span>{book.currentPage}/{book.totalPages}页</span>
                                    )}
                                </div>
                                {/* 进度条 */}
                                {book.status === 'reading' && book.totalPages > 0 && (
                                    <div style={{
                                        height: '3px',
                                        background: 'rgba(255,255,255,0.1)',
                                        borderRadius: '2px',
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{
                                            height: '100%',
                                            width: `${Math.round((book.currentPage / book.totalPages) * 100)}%`,
                                            background: 'linear-gradient(90deg, #6366f1, #8b5cf6)'
                                        }} />
                                    </div>
                                )}
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>选择级别</h2>

            <div className="levels-grid">
                {levels.map((level) => {
                    const stats = getLevelStats(level.id);
                    const hasProgress = stats.completed > 0 || stats.reading > 0;

                    return (
                        <Link
                            key={level.id}
                            to={`/level/${level.id}`}
                            className="level-card"
                            style={{
                                position: 'relative',
                                borderColor: stats.completed === level.bookCount && level.bookCount > 0
                                    ? 'rgba(16, 185, 129, 0.4)'
                                    : undefined
                            }}
                        >
                            <div className="level-card-content">
                                <div className="level-name">{level.name}</div>
                                {level.bookCount > 0 && (
                                    <div className="level-count">
                                        {hasProgress ? (
                                            <span>
                                                <span style={{ color: '#10b981' }}>{stats.completed}</span>
                                                /{level.bookCount}
                                            </span>
                                        ) : (
                                            `${level.bookCount} 本`
                                        )}
                                    </div>
                                )}
                            </div>
                            {/* 完成等级标记 */}
                            {stats.completed === level.bookCount && level.bookCount > 0 && (
                                <div style={{
                                    position: 'absolute',
                                    top: '4px',
                                    right: '4px',
                                    fontSize: '10px',
                                    color: '#10b981'
                                }}>
                                    ✓
                                </div>
                            )}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}

export default HomePage;
