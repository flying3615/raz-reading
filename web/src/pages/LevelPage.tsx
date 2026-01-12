import { Link, useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { type Book } from '../types';
import booksData from '../data/books.json';
import { useProgress } from '../contexts/ProgressContext';

function LevelPage() {
    const { level } = useParams<{ level: string }>();
    const navigate = useNavigate();
    const { progress, getLevelStats } = useProgress();

    // 从静态 JSON 获取数据
    const [books, setBooks] = useState<Book[]>([]);

    useEffect(() => {
        if (!level) return;
        const allBooks = booksData as unknown as Record<string, Book[]>;
        const levelBooks = allBooks[level] || [];
        setBooks(levelBooks);
    }, [level]);

    const stats = level ? getLevelStats(level) : { completed: 0, reading: 0, total: 0 };

    // 获取书籍状态
    const getBookStatus = (bookId: string) => {
        return progress.books[bookId]?.status || 'unread';
    };

    const getBookProgress = (bookId: string) => {
        const book = progress.books[bookId];
        if (!book || !book.totalPages) return 0;
        return Math.round((book.currentPage / book.totalPages) * 100);
    };

    return (
        <div>
            <div className="page-header">
                <button className="back-button" onClick={() => navigate(-1)}>
                    ← 返回
                </button>
                <h1 className="page-title">Level {level}</h1>
                <span style={{
                    color: 'var(--text-secondary)',
                    marginLeft: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                }}>
                    {stats.completed > 0 && (
                        <span style={{ color: '#10b981' }}>✓ {stats.completed}</span>
                    )}
                    {stats.reading > 0 && (
                        <span style={{ color: '#f59e0b' }}>📖 {stats.reading}</span>
                    )}
                    <span>共 {books.length} 本</span>
                </span>
            </div>

            {books.length === 0 && (
                <div className="error-message">
                    暂无书籍数据
                </div>
            )}

            {books.length > 0 && (
                <div className="books-grid">
                    {books.map((book) => {
                        const status = getBookStatus(book.id);
                        const progressPercent = getBookProgress(book.id);

                        return (
                            <Link
                                key={book.id}
                                to={`/read/${level}/${book.id}`}
                                className="book-card"
                                style={{
                                    position: 'relative',
                                    borderColor: status === 'completed'
                                        ? 'rgba(16, 185, 129, 0.3)'
                                        : status === 'reading'
                                            ? 'rgba(245, 158, 11, 0.3)'
                                            : undefined
                                }}
                            >
                                {/* 完成标记 */}
                                {status === 'completed' && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '8px',
                                        right: '8px',
                                        background: 'linear-gradient(135deg, #10b981, #059669)',
                                        borderRadius: '50%',
                                        width: '24px',
                                        height: '24px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '14px',
                                        color: 'white'
                                    }}>
                                        ✓
                                    </div>
                                )}

                                <div className="book-number">#{book.number}</div>
                                <div className="book-info">
                                    <div className="book-title">{book.title}</div>
                                    <div className="book-meta">
                                        Level {book.level}
                                        {status === 'reading' && progressPercent > 0 && (
                                            <span style={{ marginLeft: '8px', color: '#f59e0b' }}>
                                                {progressPercent}%
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* 进度条 */}
                                {status === 'reading' && progressPercent > 0 && (
                                    <div style={{
                                        position: 'absolute',
                                        bottom: 0,
                                        left: 0,
                                        right: 0,
                                        height: '3px',
                                        background: 'rgba(255,255,255,0.1)',
                                        borderRadius: '0 0 8px 8px',
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{
                                            height: '100%',
                                            width: `${progressPercent}%`,
                                            background: 'linear-gradient(90deg, #f59e0b, #d97706)'
                                        }} />
                                    </div>
                                )}

                                <div className="book-icons">
                                    📖 🎧
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default LevelPage;
