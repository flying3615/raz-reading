export interface Book {
    id: string;
    number: string;
    title: string;
    level: string;
    pdfPath: string;
    audioPath: string;
}

export interface Level {
    id: string;
    name: string;
    bookCount: number;
}

export const API_BASE = import.meta.env.PROD
    ? 'https://raz-api.gabriel-liu3615.workers.dev/api'
    : 'http://localhost:8787/api';
