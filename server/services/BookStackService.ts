import axios, { Method } from 'axios';
import https from 'https';
import { convertCalloutsToBookStackHtml } from './GeminiService';

interface CacheEntry {
  data: any;
  status: number;
  expiry: number;
}

export class BookStackService {
  private httpsAgent = new https.Agent({ rejectUnauthorized: false });
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 минут кеша
  private lastPruneTime = Date.now();
  private readonly PRUNE_INTERVAL = 10 * 60 * 1000; // Очистка каждые 10 минут

  /**
   * Периодическая очистка устаревших записей в кеше во избежание утечек памяти
   */
  private pruneExpiredCache(): void {
    const now = Date.now();
    if (now - this.lastPruneTime < this.PRUNE_INTERVAL) return;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiry <= now) {
        this.cache.delete(key);
      }
    }
    this.lastPruneTime = now;
  }

  public async proxyRequest(
    baseUrl: string,
    tokenId: string,
    tokenSecret: string,
    method: Method | string,
    url: string,
    data?: any,
    retries = 3,
    backoff = 1000,
    bypassCache = false
  ): Promise<{ status: number; data: any }> {
    const isGet = (method as string).toUpperCase() === 'GET';
    const cacheKey = `${baseUrl}|${tokenId}|${url}`;

    // Периодически чистим кеш
    this.pruneExpiredCache();

    if (bypassCache) {
      this.cache.delete(cacheKey);
    } else if (isGet) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        return { status: cached.status, data: cached.data };
      }
    }

    try {
      const response = await axios({
        method,
        url: `${baseUrl.replace(/\/$/, '')}${url}`,
        headers: {
          'Authorization': `Token ${tokenId}:${tokenSecret}`,
          'Accept': 'application/json',
          ...(isGet === false && { 'Content-Type': 'application/json' })
        },
        httpsAgent: this.httpsAgent,
        timeout: 30000, // Разумный таймаут 30 сек (вместо 600 сек) для предотвращения зависания сокетов сервера
        ...(data && { data })
      });

      if (isGet && response.status === 200) {
        this.cache.set(cacheKey, {
          data: response.data,
          status: response.status,
          expiry: Date.now() + this.CACHE_TTL
        });
      } else if (!isGet) {
        // Инвалидация кеша для этого инстанса при любых изменениях
        for (const key of this.cache.keys()) {
          if (key.startsWith(`${baseUrl}|${tokenId}|`)) {
            this.cache.delete(key);
          }
        }
      }

      return { status: response.status, data: response.data };
    } catch (error: any) {
      const status = error.response?.status;
      const isTunnel = baseUrl.includes('mytunnel.org') || baseUrl.includes('localtunnel.me') || baseUrl.includes('ngrok') || baseUrl.includes('trycloudflare.com');
      
      // Повторяем запрос при 502, 503, 504 или ECONNRESET
      const shouldRetry = (status === 502 || status === 503 || status === 504 || error.code === 'ECONNRESET') && retries > 0;
      
      if (shouldRetry) {
        console.warn(`[BookStackService] Ошибка ${status || error.code} при обращении к ${url}. Повтор через ${backoff} мс (Осталось попыток: ${retries})`);
        await new Promise(res => setTimeout(res, backoff));
        return this.proxyRequest(baseUrl, tokenId, tokenSecret, method, url, data, retries - 1, backoff * 2);
      }

      // Если это туннель и произошла ошибка 503 или сетевая ошибка, добавляем подсказку
      if (isTunnel && (status === 503 || error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED')) {
        if (!error.response) {
          error.response = { status: status || 503, data: {} };
        }
        if (typeof error.response.data !== 'object') {
          error.response.data = {};
        }
        error.response.data.message = `Ошибка туннеля ${status || error.code}. Вероятно, локальный агент туннеля (mytunnel/localtunnel) отключен, запущен на неверном порту или ваш локальный сервер BookStack выключен.`;
      }

      throw error;
    }
  }

  /**
   * Получение списка доступных книг и глав для передачи в контекст ИИ
   */
  public async getAvailableContext(
    baseUrl: string,
    tokenId: string,
    tokenSecret: string
  ): Promise<{ books: any[]; chapters: any[] }> {
    try {
      const [booksResp, chaptersResp] = await Promise.all([
        this.proxyRequest(baseUrl, tokenId, tokenSecret, 'GET', '/api/books?count=100').catch(() => ({ status: 200, data: { data: [] } })),
        this.proxyRequest(baseUrl, tokenId, tokenSecret, 'GET', '/api/chapters?count=100').catch(() => ({ status: 200, data: { data: [] } }))
      ]);

      const books = booksResp.data?.data || [];
      const chapters = chaptersResp.data?.data || [];
      return { books, chapters };
    } catch (e: any) {
      console.warn('[BookStackService] Не удалось загрузить контекст книг/глав:', e.message);
      return { books: [], chapters: [] };
    }
  }

  /**
   * Получение информации о книге по ID
   */
  public async getBook(
    baseUrl: string,
    tokenId: string,
    tokenSecret: string,
    bookId: number | string
  ): Promise<any> {
    const resp = await this.proxyRequest(baseUrl, tokenId, tokenSecret, 'GET', `/api/books/${bookId}`);
    return resp.data;
  }

  /**
   * Создание новой книги в BookStack
   */
  public async createBook(
    baseUrl: string,
    tokenId: string,
    tokenSecret: string,
    name: string,
    description = ''
  ): Promise<any> {
    const resp = await this.proxyRequest(baseUrl, tokenId, tokenSecret, 'POST', '/api/books', { name, description }, 3, 1000, true);
    return resp.data;
  }

  /**
   * Создание новой главы в BookStack
   */
  public async createChapter(
    baseUrl: string,
    tokenId: string,
    tokenSecret: string,
    bookId: number,
    name: string,
    description = ''
  ): Promise<any> {
    const resp = await this.proxyRequest(baseUrl, tokenId, tokenSecret, 'POST', '/api/chapters', { book_id: bookId, name, description }, 3, 1000, true);
    return resp.data;
  }

  /**
   * Создание новой страницы в BookStack
   */
  public async createPage(
    baseUrl: string,
    tokenId: string,
    tokenSecret: string,
    bookId: number,
    chapterId: number | null,
    name: string,
    markdown: string,
    tags: (string | { name: string; value: string })[] = [],
    description?: string
  ): Promise<any> {
    const htmlSafeMarkdown = convertCalloutsToBookStackHtml(markdown);
    const payload: any = {
      name,
      markdown: htmlSafeMarkdown,
      book_id: bookId,
      tags: tags.map((tag: any) => {
        if (typeof tag === 'object' && tag !== null && 'name' in tag && 'value' in tag) {
          return tag;
        }
        return { name: 'Category', value: String(tag) };
      })
    };

    if (chapterId) {
      payload.chapter_id = chapterId;
    }

    if (description) {
      payload.description = description;
    }

    const resp = await this.proxyRequest(baseUrl, tokenId, tokenSecret, 'POST', '/api/pages', payload, 3, 1000, true);
    return resp.data;
  }
}


