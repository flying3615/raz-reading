import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';

// 类型定义
export type BookStatus = 'unread' | 'reading' | 'completed';

export interface BookProgress {
    bookId: string;
    level: string;
    title: string;
    status: BookStatus;
    readingTime: number; // 秒
    lastReadAt: string;
    completedAt?: string;
    currentPage: number;
    totalPages: number;
}

export interface ReadingProgress {
    books: Record<string, BookProgress>;
    totalReadingTime: number;
    lastUpdated: string;
}

interface ProgressContextType {
    progress: ReadingProgress;
    getBookProgress: (bookId: string) => BookProgress | undefined;
    updateBookStatus: (bookId: string, level: string, title: string, status: BookStatus) => void;
    addReadingTime: (bookId: string, seconds: number) => void;
    updateCurrentPage: (bookId: string, level: string, title: string, page: number, totalPages: number) => void;
    markAsCompleted: (bookId: string, level: string, title: string) => void;
    getLevelStats: (level: string) => { completed: number; reading: number; total: number };
    getRecentBooks: (limit?: number) => BookProgress[];
    resetProgress: () => void;
}

const STORAGE_KEY = 'raz-reading-progress';

const defaultProgress: ReadingProgress = {
    books: {},
    totalReadingTime: 0,
    lastUpdated: new Date().toISOString()
};

const ProgressContext = createContext<ProgressContextType | undefined>(undefined);

export function ProgressProvider({ children }: { children: ReactNode }) {
    const [progress, setProgress] = useState<ReadingProgress>(defaultProgress);
    // 使用 ref 来保存最新的 progress，避免 callback 依赖
    const progressRef = useRef(progress);
    progressRef.current = progress;

    // 从 localStorage 加载
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                setProgress(parsed);
                progressRef.current = parsed;
            }
        } catch (e) {
            console.error('Failed to load progress:', e);
        }
    }, []);

    // 保存到 localStorage - 使用 ref 避免依赖 progress
    const saveProgress = useCallback((newProgress: ReadingProgress) => {
        newProgress.lastUpdated = new Date().toISOString();
        setProgress(newProgress);
        progressRef.current = newProgress;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newProgress));
        } catch (e) {
            console.error('Failed to save progress:', e);
        }
    }, []);

    // 使用 ref 使函数稳定，不会因为 progress 变化而重新创建
    const getBookProgress = useCallback((bookId: string) => {
        return progressRef.current.books[bookId];
    }, []);

    const updateBookStatus = useCallback((bookId: string, level: string, title: string, status: BookStatus) => {
        const current = progressRef.current;
        const existing = current.books[bookId];

        const newProgress: ReadingProgress = {
            ...current,
            books: {
                ...current.books,
                [bookId]: {
                    bookId,
                    level,
                    title,
                    status,
                    readingTime: existing?.readingTime || 0,
                    lastReadAt: new Date().toISOString(),
                    currentPage: existing?.currentPage || 1,
                    totalPages: existing?.totalPages || 0,
                    completedAt: status === 'completed' ? new Date().toISOString() : existing?.completedAt
                }
            }
        };

        saveProgress(newProgress);
    }, [saveProgress]);

    const addReadingTime = useCallback((bookId: string, seconds: number) => {
        if (seconds <= 0) return;

        const current = progressRef.current;
        if (!current.books[bookId]) return;

        const newProgress: ReadingProgress = {
            ...current,
            totalReadingTime: current.totalReadingTime + seconds,
            books: {
                ...current.books,
                [bookId]: {
                    ...current.books[bookId],
                    readingTime: (current.books[bookId].readingTime || 0) + seconds,
                    lastReadAt: new Date().toISOString()
                }
            }
        };

        saveProgress(newProgress);
    }, [saveProgress]);

    const updateCurrentPage = useCallback((bookId: string, level: string, title: string, page: number, totalPages: number) => {
        const current = progressRef.current;
        const existing = current.books[bookId];

        // 如果页码相同，不更新（防止无限循环）
        if (existing && existing.currentPage === page && existing.totalPages === totalPages) {
            return;
        }

        let status: BookStatus = existing?.status || 'reading';
        if (!existing) {
            status = 'reading';
        }

        const newProgress: ReadingProgress = {
            ...current,
            books: {
                ...current.books,
                [bookId]: {
                    bookId,
                    level,
                    title,
                    status,
                    readingTime: existing?.readingTime || 0,
                    lastReadAt: new Date().toISOString(),
                    currentPage: page,
                    totalPages,
                    completedAt: existing?.completedAt
                }
            }
        };

        saveProgress(newProgress);
    }, [saveProgress]);

    const markAsCompleted = useCallback((bookId: string, level: string, title: string) => {
        updateBookStatus(bookId, level, title, 'completed');
    }, [updateBookStatus]);

    const getLevelStats = useCallback((level: string) => {
        const books = Object.values(progressRef.current.books).filter(b => b.level === level);
        return {
            completed: books.filter(b => b.status === 'completed').length,
            reading: books.filter(b => b.status === 'reading').length,
            total: books.length
        };
    }, []);

    const getRecentBooks = useCallback((limit = 10) => {
        return Object.values(progressRef.current.books)
            .sort((a, b) => new Date(b.lastReadAt).getTime() - new Date(a.lastReadAt).getTime())
            .slice(0, limit);
    }, []);

    const resetProgress = useCallback(() => {
        saveProgress({ ...defaultProgress, lastUpdated: new Date().toISOString() });
    }, [saveProgress]);

    return (
        <ProgressContext.Provider value={{
            progress,
            getBookProgress,
            updateBookStatus,
            addReadingTime,
            updateCurrentPage,
            markAsCompleted,
            getLevelStats,
            getRecentBooks,
            resetProgress
        }}>
            {children}
        </ProgressContext.Provider>
    );
}

export function useProgress() {
    const context = useContext(ProgressContext);
    if (!context) {
        throw new Error('useProgress must be used within a ProgressProvider');
    }
    return context;
}
