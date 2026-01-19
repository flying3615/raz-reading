import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import booksData from '../data/books.json';
import { getLevelContent } from '../data/loadLevelContent';
import type { BookContent } from '../data/loadLevelContent';
import { useProgress } from '../contexts/ProgressContext';

function PracticePage() {
    const { level, bookId } = useParams<{ level: string; bookId: string }>();
    // const navigate = useNavigate();
    const { markPracticed } = useProgress();

    const [practiceContent, setPracticeContent] = useState<BookContent | null>(null);
    const [bookTitle, setBookTitle] = useState('');

    useEffect(() => {
        if (level && bookId) {
            // Load Title
            // @ts-ignore
            const lvlBooks = booksData[level];
            const book = lvlBooks?.find((b: any) => b.id === bookId);
            if (book) setBookTitle(book.title);

            // Load Content
            const lvlContent = getLevelContent(level);
            if (lvlContent && lvlContent[bookId]) {
                setPracticeContent(lvlContent[bookId]);
            }
        }
    }, [level, bookId]);

    const handleComplete = () => {
        if (bookId) {
            markPracticed(bookId);
            window.close();
        }
    };

    if (!practiceContent) {
        return (
            <div style={{ padding: '20px', color: 'white', textAlign: 'center' }}>
                Loading practice content...
            </div>
        );
    }

    return (
        <div style={{
            maxWidth: '800px',
            margin: '0 auto',
            padding: '20px 20px 100px 20px',
            color: 'white',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '15px',
                marginBottom: '30px',
                paddingBottom: '20px',
                borderBottom: '1px solid rgba(255,255,255,0.1)'
            }}>
                <button
                    onClick={() => window.close()}
                    style={{
                        background: 'rgba(255,255,255,0.1)',
                        border: 'none',
                        borderRadius: '12px',
                        padding: '10px 15px',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '1rem'
                    }}
                >
                    ✕ Close
                </button>
                <div>
                    <div style={{ fontSize: '0.9rem', color: '#a5b4fc' }}>Practice Mode</div>
                    <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{bookTitle}</h1>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Vocabulary */}
                <details open style={{
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '16px',
                    padding: '20px',
                    border: '1px solid rgba(255,255,255,0.05)'
                }}>
                    <summary style={{ cursor: 'pointer', outline: 'none', marginBottom: '15px', color: '#a5b4fc', fontSize: '1.3rem', fontWeight: 'bold' }}>
                        📚 Key Vocabulary
                    </summary>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                        {(practiceContent.vocabulary || []).map((vocab, idx) => (
                            <div key={idx} style={{
                                background: 'rgba(0,0,0,0.2)',
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
                </details>

                {/* Quiz */}
                <details style={{
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '16px',
                    padding: '20px',
                    border: '1px solid rgba(255,255,255,0.05)'
                }}>
                    <summary style={{ cursor: 'pointer', outline: 'none', marginBottom: '15px', color: '#fda4af', fontSize: '1.3rem', fontWeight: 'bold' }}>
                        📝 Quick Quiz
                    </summary>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {(practiceContent.quiz || []).map((q, idx) => (
                            <div key={idx} style={{
                                background: 'rgba(0,0,0,0.2)',
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
                                                // Reset siblings
                                                const parent = btn.parentElement;
                                                if (parent) {
                                                    Array.from(parent.children).forEach((child: any) => {
                                                        child.style.background = 'rgba(255,255,255,0.05)';
                                                        child.style.borderColor = 'rgba(255,255,255,0.1)';
                                                    });
                                                }

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
                </details>

                {/* Discussion */}
                {practiceContent.discussion && practiceContent.discussion.length > 0 && (
                    <details style={{
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: '16px',
                        padding: '20px',
                        border: '1px solid rgba(255,255,255,0.05)'
                    }}>
                        <summary style={{ cursor: 'pointer', outline: 'none', marginBottom: '15px', color: '#c084fc', fontSize: '1.3rem', fontWeight: 'bold' }}>
                            🗣️ Discussion
                        </summary>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            {practiceContent.discussion.map((item, idx) => (
                                <div key={idx} style={{
                                    background: 'rgba(0,0,0,0.2)',
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
                                            listStyle: 'none',
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
                    </details>
                )}
            </div>

            {/* Complete Button */}
            <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'center' }}>
                <button
                    onClick={handleComplete}
                    style={{
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        border: 'none',
                        padding: '15px 40px',
                        borderRadius: '30px',
                        color: 'white',
                        fontSize: '1.1rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)',
                        transition: 'transform 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                    ✅ Mark as Complete
                </button>
            </div>
        </div>
    );
}

export default PracticePage;
