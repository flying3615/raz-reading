import { useProgress } from '../contexts/ProgressContext';
import { Link } from 'react-router-dom';
import booksData from '../data/books.json';

// All levels
const LEVELS = ['AA', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'Z1', 'Z2'];

function formatTime(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h${remainingMinutes > 0 ? ` ${remainingMinutes}m` : ''}`;
}

function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US');
}

function StatsPage() {
    const { progress, getRecentBooks, resetProgress } = useProgress();
    const allBooks = booksData as unknown as Record<string, { id: string; title: string }[]>;

    // Calculate overall statistics
    const totalBooks = Object.values(progress.books).length;
    const completedBooks = Object.values(progress.books).filter(b => b.status === 'completed').length;
    const readingBooks = Object.values(progress.books).filter(b => b.status === 'reading').length;

    // Statistics by level
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
                📊 My Reading Stats
            </h1>

            {/* Overall Stats Cards */}
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
                    <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Total Reading Time</div>
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
                    <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Completed</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px' }}>
                        {completedBooks} books
                    </div>
                </div>

                <div style={{
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    borderRadius: '12px',
                    padding: '20px',
                    color: 'white'
                }}>
                    <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Reading</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px' }}>
                        {readingBooks} books
                    </div>
                </div>

                <div style={{
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    borderRadius: '12px',
                    padding: '20px',
                    color: 'white'
                }}>
                    <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Total Read</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px' }}>
                        {totalBooks} books
                    </div>
                </div>
            </div>

            {/* Level Progress */}
            <div style={{
                background: 'var(--bg-secondary)',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '24px'
            }}>
                <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>📚 Level Progress</h2>
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

            {/* Recent Reading */}
            {recentBooks.length > 0 && (
                <div style={{
                    background: 'var(--bg-secondary)',
                    borderRadius: '12px',
                    padding: '20px',
                    marginBottom: '24px'
                }}>
                    <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>📖 Recent Reading</h2>
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
                                        {book.totalPages > 0 ? ` ${book.currentPage}/${book.totalPages} pages · ` : ' '}
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

            {/* Reset Button */}
            {totalBooks > 0 && (
                <div style={{ textAlign: 'center', marginTop: '32px' }}>
                    <button
                        onClick={() => {
                            if (confirm('Are you sure you want to reset all reading progress? This action cannot be undone!')) {
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
                        Reset All Progress
                    </button>
                </div>
            )}

            {/* Empty State */}
            {totalBooks === 0 && (
                <div style={{
                    textAlign: 'center',
                    padding: '60px 20px',
                    color: 'var(--text-secondary)'
                }}>
                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📖</div>
                    <div style={{ fontSize: '1.1rem', marginBottom: '8px' }}>No reading records yet</div>
                    <div style={{ fontSize: '0.9rem' }}>Start reading your first book!</div>
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
                        Browse Books
                    </Link>
                </div>
            )}
        </div>
    );
}

export default StatsPage;

