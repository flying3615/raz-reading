// Dynamic loader for level-specific content files
// This approach uses static imports for Vite's bundle optimization

import levelA from './levels/level-A.json';
import levelK from './levels/level-K.json';

// Type for book content
export interface BookContent {
    fullText?: string;
    quiz?: Array<{
        question: string;
        options: string[];
        correctAnswer: number;
    }>;
    vocabulary?: Array<{
        word: string;
        definition: string;
        partOfSpeech?: string;
        example?: string;
    }>;
    discussion?: Array<{
        question: string;
        analysis?: string;
    }>;
}

// Map of level -> content
const levelContentMap: Record<string, Record<string, BookContent>> = {
    'A': levelA as Record<string, BookContent>,
    'K': levelK as Record<string, BookContent>,
};

/**
 * Get content for a specific level
 * @param level - The book level (e.g., 'A', 'K')
 * @returns The content map for that level, or undefined if not found
 */
export function getLevelContent(level: string): Record<string, BookContent> | undefined {
    return levelContentMap[level];
}

/**
 * Get content for a specific book
 * @param level - The book level (e.g., 'A', 'K')
 * @param bookId - The book ID
 * @returns The book content, or undefined if not found
 */
export function getBookContent(level: string, bookId: string): BookContent | undefined {
    const levelContent = levelContentMap[level];
    return levelContent ? levelContent[bookId] : undefined;
}

/**
 * Get all available levels
 */
export function getAvailableLevels(): string[] {
    return Object.keys(levelContentMap);
}
