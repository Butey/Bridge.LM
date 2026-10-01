import { useState, useCallback } from 'react';
import { BookStackCredentials, BookStackBook, BookStackChapter, BookStackPage } from '../types';
import { fetchBooks, fetchChaptersAndPages, fetchChapterPages, invalidateCache } from '../services/api';

export function useBookStackSync(
  credentials: BookStackCredentials,
  setSyncStatus: React.Dispatch<React.SetStateAction<{ type: 'success' | 'error' | 'idle', message: string, url?: string }>>
) {
  const [books, setBooks] = useState<BookStackBook[]>([]);
  const [chapters, setChapters] = useState<BookStackChapter[]>([]);
  const [pages, setPages] = useState<BookStackPage[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null);
  
  const [isLoadingBooks, setIsLoadingBooks] = useState(false);
  const [isLoadingChapters, setIsLoadingChapters] = useState(false);
  const [isLoadingPages, setIsLoadingPages] = useState(false);

  const loadBooks = useCallback(async (bypassCache = true) => {
    setIsLoadingBooks(true);
    setSyncStatus({ type: 'idle', message: 'Тестирование подключения и загрузка книг...' });
    try {
      if (bypassCache && credentials.baseUrl) {
        invalidateCache(credentials.baseUrl);
      }
      const data = await fetchBooks(credentials, (updatedData) => {
        setBooks(updatedData);
      }, bypassCache);
      setBooks(data);
      const successMsg = `Успешно подключено к BookStack. Загружено книг: ${data.length}`;
      setSyncStatus({ type: 'success', message: successMsg });
      return { success: true, count: data.length, books: data };
    } catch (e: any) {
      console.error(e);
      const errorMsg = e.response?.data?.error || e.response?.data?.message || e.message || 'Ошибка подключения. Проверьте URL и учетные данные.';
      setSyncStatus({ type: 'error', message: errorMsg });
      return { success: false, error: errorMsg, count: 0, books: [] };
    } finally {
      setIsLoadingBooks(false);
    }
  }, [credentials, setSyncStatus]);

  const loadChaptersAndPages = useCallback(async (bookId: number, silent = false) => {
    setSelectedBookId(bookId);
    setSelectedChapterId(null);
    setSelectedPageId(null);
    setIsLoadingChapters(true);
    setIsLoadingPages(true);
    if (!silent) {
      setSyncStatus({ type: 'idle', message: 'Загрузка структуры книги...' });
    }
    
    try {
      const updatedData = await fetchChaptersAndPages(credentials, bookId, (updatedData) => {
        setChapters(updatedData.chapters);
        setPages(updatedData.pages);
      });
      setChapters(updatedData.chapters);
      setPages(updatedData.pages);
      if (!silent) {
        setSyncStatus({ type: 'idle', message: '' });
      }
    } catch (e: any) {
      if (!silent) {
        setSyncStatus({ type: 'error', message: 'Не удалось загрузить главы и страницы для этой книги.' });
      }
    } finally {
      setIsLoadingChapters(false);
      setIsLoadingPages(false);
    }
  }, [credentials, setSyncStatus]);

  const loadChapterPages = useCallback(async (chapterId: number, silent = false) => {
    setSelectedChapterId(chapterId);
    setSelectedPageId(null);
    setIsLoadingPages(true);
    if (!silent) {
      setSyncStatus({ type: 'idle', message: 'Загрузка страниц главы...' });
    }
    
    try {
      const data = await fetchChapterPages(credentials, chapterId, (updatedData) => {
        setPages(updatedData);
      });
      setPages(data);
      if (!silent) {
        setSyncStatus({ type: 'idle', message: '' });
      }
    } catch (e: any) {
      if (!silent) {
        setSyncStatus({ type: 'error', message: 'Не удалось загрузить страницы для этой главы.' });
      }
    } finally {
      setIsLoadingPages(false);
    }
  }, [credentials, setSyncStatus]);

  return {
    books, setBooks,
    chapters, setChapters,
    pages, setPages,
    selectedBookId, setSelectedBookId,
    selectedChapterId, setSelectedChapterId,
    selectedPageId, setSelectedPageId,
    isLoadingBooks,
    isLoadingChapters,
    isLoadingPages,
    loadBooks,
    loadChaptersAndPages,
    loadChapterPages
  };
}
