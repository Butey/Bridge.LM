import { Request, Response } from 'express';
import path from 'path';
import { MarkItDown } from 'markitdown';
import { SettingsService } from '../services/SettingsService';
import { GeminiService } from '../services/GeminiService';
import { BookStackService } from '../services/BookStackService';
import { OmnideskService } from '../services/OmnideskService';
import { vectorStore } from '../services/VectorStore';

export class ApiController {
  private settingsService = new SettingsService();
  private geminiService = new GeminiService();
  private bookStackService = new BookStackService();
  private omnideskService = new OmnideskService();
  private markItDown = new MarkItDown();
  private activeProcessingCases = new Set<string>();

  public indexVectorDocument = async (req: Request, res: Response): Promise<any> => {
    try {
      const sessionId = req.headers['x-session-id'] as string || 'default';
      const { id, text, metadata } = req.body;
      if (!id || !text) return res.status(400).json({ error: 'id and text are required' });
      const settings = this.settingsService.getSettings();
      const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || '';
      if (!apiKey) {
        console.warn('[ApiController] GEMINI_API_KEY not configured. Indexing will proceed with zero-vector fallback.');
      }
      await vectorStore.addDocument(sessionId, id, text, metadata, apiKey);
      res.json({ success: true, count: vectorStore.getDocumentsCount(sessionId) });
    } catch (e: any) {
      console.error('[ApiController] Failed to index vector document:', e.message || e);
      res.status(500).json({ error: e.message });
    }
  };

  public searchVectorStore = async (req: Request, res: Response): Promise<any> => {
    try {
      const sessionId = req.headers['x-session-id'] as string || 'default';
      const { query, limit } = req.body;
      if (!query) return res.status(400).json({ error: 'query is required' });
      const settings = this.settingsService.getSettings();
      const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || '';
      if (!apiKey) {
        console.warn('[ApiController] GEMINI_API_KEY not configured. Search will proceed with zero-vector fallback.');
      }
      const results = await vectorStore.search(sessionId, query, parseInt(limit as string) || 5, apiKey);
      const safeResults = results.map(r => ({ id: r.id, text: r.text, metadata: r.metadata, score: r.score }));
      res.json({ results: safeResults });
    } catch (e: any) {
      console.error('[ApiController] Failed to search vector store:', e.message || e);
      res.status(500).json({ error: e.message });
    }
  };

  public getVectorStoreStats = async (req: Request, res: Response): Promise<any> => {
    const sessionId = req.headers['x-session-id'] as string || 'default';
    res.json({ count: vectorStore.getDocumentsCount(sessionId) });
  };

  public checkHealth = (req: Request, res: Response): void => {
    const settings = this.settingsService.getSettings();
    const hasKey = !!(settings.geminiApiKey || process.env.GEMINI_API_KEY);
    res.json({ status: 'ok', environment: process.env.NODE_ENV || 'development', key: hasKey });
  };

  public getConfig = (req: Request, res: Response): void => {
    res.json({
      bookstack: {
        hasEnv: !!(process.env.BOOKSTACK_BASE_URL && process.env.BOOKSTACK_TOKEN_ID && process.env.BOOKSTACK_TOKEN_SECRET),
        envBaseUrl: process.env.BOOKSTACK_BASE_URL || ''
      },
      omnidesk: {
        hasEnv: !!(process.env.OMNIDESK_DOMAIN && process.env.OMNIDESK_EMAIL && process.env.OMNIDESK_API_KEY),
        envDomain: process.env.OMNIDESK_DOMAIN || ''
      }
    });
  };

  public getSettings = (req: Request, res: Response): void => {
    try {
      const settings = this.settingsService.getSettings();
      // Masking sensitive Data
      if (settings.geminiApiKey) settings.geminiApiKey = 'SERVER_MANAGED';
      if (settings.bookstack) {
        if (settings.bookstack.tokenId) settings.bookstack.tokenId = 'SERVER_MANAGED';
        if (settings.bookstack.tokenSecret) settings.bookstack.tokenSecret = 'SERVER_MANAGED';
      }
      if (settings.omnidesk) {
        if (settings.omnidesk.apiKey) settings.omnidesk.apiKey = 'SERVER_MANAGED';
      }
      res.json(settings);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  };

  public updateSettings = (req: Request, res: Response): void => {
    try {
      const updates = { ...req.body };
      
      // Безопасность: запрет перезаписи секретов через открытый эндпоинт
      const sensitiveFields = [
        'geminiApiKey', 
        'password', 
        'bookstack_creds', 
        'omnidesk_creds',
        'bookstack',
        'omnidesk'
      ];

      sensitiveFields.forEach(field => {
        if (field in updates) delete updates[field];
      });

      this.settingsService.updateSettings(updates);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  };

  public processSource = async (req: Request, res: Response): Promise<any> => {
    try {
      const file = req.file;
      const text = req.body.text || '';
      const useMarkItDown = req.body.useMarkItDown === 'true' || req.body.useMarkItDown === true;
      
      if (file) {
        let name = file.originalname;
        try {
          name = Buffer.from(file.originalname, 'latin1').toString('utf8');
        } catch {
          // Fallback to original
        }

        let markitdownText = '';
        let isParsedLocally = false;

        if (useMarkItDown) {
          try {
            const ext = path.extname(name).toLowerCase();
            const conversionResult = await this.markItDown.convert(file.buffer, {
              fileExtension: ext
            });
            if (conversionResult && conversionResult.markdown !== undefined) {
              markitdownText = conversionResult.markdown;
              isParsedLocally = true;
            }
          } catch (midError: any) {
            console.error('Failed to parse file with MarkItDown:', midError);
          }
        }

        let metadata = {};
        if (file.mimetype === 'application/pdf') {
          try {
            metadata = this.extractPdfMetadata(file.buffer);
          } catch (pdfError) {
            console.warn('Failed to extract PDF metadata:', pdfError);
          }
        }

        return res.json({ 
          base64: file.buffer.toString('base64'), 
          mimeType: file.mimetype,
          name,
          metadata,
          markitdownText,
          isParsedLocally
        });
      }
      
      if (!text) return res.status(400).json({ error: 'Не предоставлен контент' });
      res.json({ content: text, name: 'Ручной ввод' });
    } catch (error: any) {
      console.error('Ошибка обработки запроса:', error);
      res.status(500).json({ error: `Ошибка сервера: ${error.message}` });
    }
  };

  public generateGemini = async (req: Request, res: Response): Promise<any> => {
    const settings = this.settingsService.getSettings();
    const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
    
    const { model, contents, config } = req.body;
    if (!model || !contents) return res.status(400).json({ error: 'model and contents are required' });
    
    try {
      const result = await this.geminiService.generateContent(apiKey, model, contents, config);
      res.json({ text: result.text, modelUsed: result.modelUsed });
    } catch (error: any) {
      console.error('[Gemini Error]', error?.message || error);
      
      let errMsg = error?.message || 'Gemini request failed';
      try {
        if (typeof errMsg === 'string' && errMsg.includes('{')) {
          const parsed = JSON.parse(errMsg);
          if (parsed.error && parsed.error.message) {
            errMsg = parsed.error.message;
          }
        }
      } catch (e) {}

      res.status(500).json({ error: errMsg });
    }
  };

  public generateArticle = async (req: Request, res: Response): Promise<any> => {
    const settings = this.settingsService.getSettings();
    const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
    
    const { sources, goal, targetMode, availableContext, model, existingContent, systemInstruction, dataStructure, attachments, previousChat, retrievedContext, ticketInfo } = req.body;
    
    try {
      const generationModel = model || 'gemini-3.7-flash';
      const result = await this.geminiService.generateArticle(
        apiKey,
        sources || '',
        goal || 'Составьте краткий обзор и организуйте данные в профессиональное руководство.',
        targetMode || 'create',
        availableContext,
        generationModel,
        existingContent || '',
        systemInstruction || '',
        dataStructure || '',
        attachments,
        previousChat,
        retrievedContext,
        ticketInfo
      );
      res.json(result);
    } catch (error: any) {
      console.error('[Article Generation Error]', error?.message || error);
      res.status(500).json({ error: error?.message || 'Не удалось сгенерировать статью' });
    }
  };

  public auditArticle = async (req: Request, res: Response): Promise<any> => {
    const settings = this.settingsService.getSettings();
    const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY не настроен на сервере' });

    const { markdown, model, targetCriteria } = req.body;
    if (!markdown || typeof markdown !== 'string' || !markdown.trim()) {
      return res.status(400).json({ error: 'Параметр markdown обязателен для проведения аудита статьи' });
    }

    try {
      const generationModel = model || 'gemini-3.7-flash';
      const result = await this.geminiService.auditArticle(
        apiKey,
        markdown,
        generationModel,
        targetCriteria
      );
      res.json(result);
    } catch (error: any) {
      console.error('[Article Audit Error]', error?.message || error);
      res.status(500).json({ error: error?.message || 'Не удалось выполнить аудит статьи' });
    }
  };

  public refineArticle = async (req: Request, res: Response): Promise<any> => {
    const settings = this.settingsService.getSettings();
    const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY не настроен на сервере' });

    const { markdown, instructions, activeSkills, model, availableContext } = req.body;
    if (!markdown || typeof markdown !== 'string' || !markdown.trim()) {
      return res.status(400).json({ error: 'Параметр markdown обязателен для проведения ревизии статьи' });
    }

    try {
      const generationModel = model || 'gemini-3.7-flash';
      const result = await this.geminiService.refineArticle(
        apiKey,
        markdown,
        instructions,
        activeSkills,
        generationModel,
        availableContext
      );
      res.json(result);
    } catch (error: any) {
      console.error('[Article Refinement Error]', error?.message || error);
      res.status(500).json({ error: error?.message || 'Не удалось выполнить ревизию статьи' });
    }
  };

  public proxyBookStack = async (req: Request, res: Response): Promise<any> => {
    const { method, url, data, credentials, bypassCache } = req.body;
    const settings = this.settingsService.getSettings();
    
    let baseUrl = '';
    let tokenId = '';
    let tokenSecret = '';

    const hasEnv = !!(process.env.BOOKSTACK_BASE_URL && process.env.BOOKSTACK_TOKEN_ID && process.env.BOOKSTACK_TOKEN_SECRET);
    const hasCustomCreds = !!(credentials?.tokenId && credentials.tokenId !== 'SERVER_MANAGED' && credentials?.tokenSecret && credentials.tokenSecret !== 'SERVER_MANAGED');

    if (hasCustomCreds) {
      baseUrl = credentials.baseUrl?.trim() || '';
      tokenId = credentials.tokenId.trim();
      tokenSecret = credentials.tokenSecret.trim();
    } else if (hasEnv) {
      baseUrl = process.env.BOOKSTACK_BASE_URL!.trim();
      tokenId = process.env.BOOKSTACK_TOKEN_ID!.trim();
      tokenSecret = process.env.BOOKSTACK_TOKEN_SECRET!.trim();
    } else {
      baseUrl = credentials?.baseUrl?.trim() || settings.bookstack?.baseUrl?.trim() || settings.bookstack_creds?.baseUrl?.trim() || '';
      tokenId = credentials?.tokenId?.trim() || settings.bookstack?.tokenId?.trim() || settings.bookstack_creds?.tokenId?.trim() || '';
      tokenSecret = credentials?.tokenSecret?.trim() || settings.bookstack?.tokenSecret?.trim() || settings.bookstack_creds?.tokenSecret?.trim() || '';
    }

    if (!baseUrl || !tokenId || !tokenSecret) {
      return res.status(400).json({ error: 'Missing BookStack credentials. Please check settings or .env file.' });
    }

    try {
      const { status, data: responseData } = await this.bookStackService.proxyRequest(baseUrl, tokenId, tokenSecret, method, url, data, 3, 1000, !!bypassCache);
      res.status(status).json(responseData);
    } catch (error: any) {
      const status = error.response?.status || 500;
      let errorData = error.response?.data || { message: error.message, code: error.code };

      if (typeof errorData === 'string' && errorData.toLowerCase().includes('<html')) {
        if (status === 503) {
          errorData = { message: 'Сервис недоступен (503 Service Unavailable). Сервер BookStack перегружен или недоступен.' };
        } else if (status === 502) {
          errorData = { message: 'Ошибочный шлюз (502 Bad Gateway). Проблема с прокси-сервером или nginx перед BookStack.' };
        } else if (status === 504) {
          errorData = { message: 'Тайм-аут шлюза (504 Gateway Timeout). Сервер BookStack слишком долго отвечает.' };
        } else {
          errorData = { message: 'Получена HTML-страница с ошибкой от сервера. Пожалуйста, проверьте правильность Base URL.' };
        }
      }

      console.error(`[BookStack Error] ${method} ${url} - Status: ${status} - Message:`, errorData.message || errorData.error?.message || 'Unknown error');
      
      let errorMessage = 'Произошла ошибка при обращении к BookStack API. Пожалуйста, проверьте учетные данные и Base URL.';
      
      // Точечная диагностика сетевых ошибок
      if (error.code === 'ECONNREFUSED') {
        errorMessage = `Подключение отклонено (ECONNREFUSED) по адресу ${baseUrl}. Убедитесь, что сервер BookStack запущен, слушает порт (например, 80 или 443 для SSL) и брандмауэр (firewall) сервера или вашей VPS не блокирует исходящие/входящие запросы.`;
      } else if (error.code === 'ENOTFOUND') {
        errorMessage = `DNS-адрес не найден (ENOTFOUND). Убедитесь, что доменное имя в Base URL (${baseUrl}) указано правильно и зарегистрировано в DNS.`;
      } else if (error.code === 'ETIMEDOUT' || error.code === 'TIMEOUT' || error.message?.includes('timeout')) {
        errorMessage = `Превышено время ожидания ответа (Timeout) от ${baseUrl}. Сервер слишком долго отвечает или недоступен из-за проблем с сетью.`;
      } else if (errorData.error?.message) {
        errorMessage = errorData.error.message;
      } else if (errorData.message) {
        errorMessage = errorData.message;
      } else if (status === 502) {
        errorMessage = 'Ошибка 502 (Bad Gateway). Nginx или прокси перед BookStack не может получить ответ от самого BookStack.';
      } else if (status === 503) {
        errorMessage = 'Ошибка 503 (Service Unavailable). Сервер BookStack перегружен, выключен или находится на обслуживании.';
      } else if (status === 504) {
        errorMessage = 'Ошибка 504 (Gateway Timeout). Прокси-сервер не дождался ответа от BookStack.';
      } else if (status === 404) {
        errorMessage = 'API эндпоинт не найден (404). Проверьте корректность Base URL и то, что ваша версия BookStack поддерживает API.';
      } else if (status === 401) {
        errorMessage = 'Ошибка авторизации (401). Пожалуйста, проверьте правильность Token ID и Token Secret в настройках.';
      }
      
      res.status(status).json({ 
        error: errorMessage,
        details: typeof errorData === 'object' ? errorData : { raw: String(errorData) }
      });
    }
  };

  public fetchOmnideskTicket = async (req: Request, res: Response): Promise<any> => {
    const { ticketId, domain, email, apiKey } = req.body;
    const settings = this.settingsService.getSettings();
    
    const resolveCred = (envVal: string | undefined, setVal: string | undefined, credVal: string | undefined) => {
      if (envVal && envVal.trim()) return envVal.trim();
      if (setVal && setVal.trim()) return setVal.trim();
      if (credVal && credVal.trim() && credVal !== 'SERVER_MANAGED') return credVal.trim();
      return '';
    };

    const targetDomain = resolveCred(process.env.OMNIDESK_DOMAIN, settings.omnidesk?.domain, domain);
    const targetEmail = resolveCred(process.env.OMNIDESK_EMAIL, settings.omnidesk?.email, email);
    const targetApiKey = resolveCred(process.env.OMNIDESK_API_KEY, settings.omnidesk?.apiKey, apiKey);
    
    if (!ticketId || !targetDomain || !targetEmail || !targetApiKey) {
      return res.status(400).json({ error: 'Необходимо указать ID тикета и учетные данные Omnidesk (через настройки или .env)' });
    }

    try {
      const ticketData = await this.omnideskService.getTicket(targetDomain, targetEmail, targetApiKey, ticketId);
      const ticketStaffUrl = ticketData.ticketUrl || `https://${targetDomain}.omnidesk.ru/staff/cases/${ticketData.caseId || ticketId}`;
      res.json({
        content: ticketData.content,
        name: `Omnidesk Ticket #${ticketData.caseNumber || ticketId}`,
        attachments: ticketData.attachments,
        caseId: ticketData.caseId,
        caseNumber: ticketData.caseNumber || ticketId,
        ticketUrl: ticketStaffUrl
      });
    } catch (error: any) {
      console.error('[Omnidesk Error]', error?.message);
      res.status(500).json({ error: error?.message || 'Не удалось получить тикет из Omnidesk' });
    }
  };

  public handleOmnideskWebhook = async (req: Request, res: Response): Promise<any> => {
    // GET-запрос: информация об эндпоинте
    if (req.method === 'GET') {
      return res.json({
        status: 'active',
        endpoint: '/api/omnidesk/webhook',
        methodsSupported: ['POST', 'GET'],
        description: 'Bridge.LM Webhook для автоматического создания статей BookStack по правилам Omnidesk',
        requiredParams: 'case_id (или ticket_id)',
        auth: 'secret (query, x-omnidesk-secret заголовок или body.secret)'
      });
    }

    try {
      // 1. Проверка секрета (гибкая авторизация)
      const settings = this.settingsService.getSettings();
      const expectedSecret = process.env.OMNIDESK_WEBHOOK_SECRET || (settings as any).omnideskWebhookSecret;
      
      const secretHeader = req.headers['x-omnidesk-secret'] as string;
      const authHeader = req.headers['authorization'];
      const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
      const querySecret = req.query.secret as string;
      const bodySecret = req.body?.secret;
      const providedSecret = secretHeader || bearerSecret || querySecret || bodySecret;

      if (expectedSecret && (!providedSecret || providedSecret !== expectedSecret)) {
        console.warn(`[Omnidesk Webhook] ❌ Неверный или отсутствующий токен авторизации вебхука. IP: ${req.ip}`);
        return res.status(401).json({ error: 'Неверный или отсутствующий токен авторизации (secret)' });
      }

      // 2. Извлечение ID или номера обращения (поддерживаем case_id, case_number, ticket_id)
      const rawCaseId = req.body?.case_id || 
                        req.body?.case_number || 
                        req.body?.caseNumber || 
                        req.body?.ticket_id || 
                        req.body?.caseId || 
                        req.body?.ticketId || 
                        req.body?.case?.case_id || 
                        req.body?.case?.case_number || 
                        req.query?.case_id || 
                        req.query?.case_number || 
                        req.query?.ticket_id || 
                        req.query?.id;
      
      if (!rawCaseId) {
        console.warn('[Omnidesk Webhook] ⚠️ Запрос получен без case_id / case_number. Тело:', JSON.stringify(req.body));
        return res.status(400).json({ 
          error: 'Не указан идентификатор обращения. Передайте "case_id" или "case_number" в теле запроса (JSON) или в параметрах URL (?case_id={case_id})' 
        });
      }

      // Удаляем возможные решетки и пробелы, сохраняя как числа, так и составные номера (напр. 986-118388)
      const caseId = String(rawCaseId).trim().replace(/^#/, '');
      if (!caseId) {
        return res.status(400).json({ error: `Некорректный идентификатор обращения: ${rawCaseId}` });
      }

      // Защита от параллельного дублирования одной и той же задачи
      if (this.activeProcessingCases.has(caseId)) {
        console.log(`[Omnidesk Webhook] [Case #${caseId}] ⏳ Обращение уже находится в процессе обработки.`);
        return res.status(200).json({ 
          success: true, 
          status: 'already_processing', 
          caseId, 
          message: `Обращение #${caseId} уже обрабатывается в фоне` 
        });
      }

      // Немедленный ответ 202 для Omnidesk (предотвращение таймаута правила)
      res.status(202).json({
        success: true,
        status: 'queued',
        caseId: caseId,
        message: `Обращение #${caseId} принято в очередь на генерацию статьи BookStack`
      });

      // Запуск асинхронной фоновой обработки
      this.processTicketToBookStack(caseId).catch(err => {
        console.error(`[Omnidesk Webhook] [Case #${caseId}] ❌ Критическая ошибка фоновой обработки:`, err.message || err);
      });

    } catch (error: any) {
      console.error('[Omnidesk Webhook Error]', error?.message || error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Внутренняя ошибка сервера при обработке вебхука' });
      }
    }
  };

  /**
   * Фоновый конвейер обработки тикета и публикации в BookStack
   */
  private async processTicketToBookStack(caseId: string): Promise<void> {
    const startTime = Date.now();
    this.activeProcessingCases.add(caseId);

    try {
      console.log(`\n==================================================`);
      console.log(`🚀 [Omnidesk Webhook] [Case #${caseId}] Старт фонового пайплайна генерации статьи...`);

      const settings = this.settingsService.getSettings();

      // Учетные данные Omnidesk
      const domain = process.env.OMNIDESK_DOMAIN || settings.omnidesk?.domain;
      const email = process.env.OMNIDESK_EMAIL || settings.omnidesk?.email;
      const apiKey = process.env.OMNIDESK_API_KEY || settings.omnidesk?.apiKey;

      if (!domain || !email || !apiKey || apiKey === 'SERVER_MANAGED') {
        console.error(`[Omnidesk Webhook] [Case #${caseId}] ❌ Ошибка: Не настроены учетные данные Omnidesk в .env или настройках сервера.`);
        return;
      }

      // Учетные данные BookStack
      const baseUrl = process.env.BOOKSTACK_BASE_URL || settings.bookstack?.baseUrl || settings.bookstack_creds?.baseUrl;
      const tokenId = process.env.BOOKSTACK_TOKEN_ID || settings.bookstack?.tokenId || settings.bookstack_creds?.tokenId;
      const tokenSecret = process.env.BOOKSTACK_TOKEN_SECRET || settings.bookstack?.tokenSecret || settings.bookstack_creds?.tokenSecret;

      if (!baseUrl || !tokenId || !tokenSecret || tokenId === 'SERVER_MANAGED') {
        console.error(`[Omnidesk Webhook] [Case #${caseId}] ❌ Ошибка: Не настроены учетные данные BookStack в .env или настройках сервера.`);
        return;
      }

      // Ключ Gemini API
      const geminiKey = settings.geminiApiKey && settings.geminiApiKey !== 'SERVER_MANAGED' 
        ? settings.geminiApiKey 
        : process.env.GEMINI_API_KEY;

      if (!geminiKey) {
        console.error(`[Omnidesk Webhook] [Case #${caseId}] ❌ Ошибка: GEMINI_API_KEY не настроен на сервере.`);
        return;
      }

      // 1. Загрузка тикета из Omnidesk
      console.log(`[Omnidesk Webhook] [Case #${caseId}] 📥 Загрузка данных тикета и истории сообщений из Omnidesk API...`);
      const ticketData = await this.omnideskService.getTicket(domain, email, apiKey, caseId);
      const actualNumericId = ticketData.caseId || caseId;
      const displayCaseNumber = ticketData.caseNumber || caseId;
      console.log(`[Omnidesk Webhook] [Case #${displayCaseNumber} (ID: ${actualNumericId})] ✅ Тикет загружен. Размер текста: ${ticketData.content.length} симв, вложений: ${ticketData.attachments.length}`);

      // 2. Экспресс-оценка полезности (AI Triage Check)
      console.log(`[Omnidesk Webhook] [Case #${displayCaseNumber}] 🔍 Проверка технической ценности обращения (AI Triage)...`);
      const triage = await this.geminiService.triageTicket(geminiKey, ticketData.content);
      if (!triage.isEligible) {
        console.log(`[Omnidesk Webhook] [Case #${displayCaseNumber}] ⏭️ Обращение пропущено ИИ: "${triage.reason}". Статья в BookStack создаваться не будет.`);
        return;
      }
      console.log(`[Omnidesk Webhook] [Case #${displayCaseNumber}] ✅ Обращение одобрено ИИ: "${triage.reason}"`);

      // 3. Загрузка структуры BookStack для автономного авто-размещения
      console.log(`[Omnidesk Webhook] [Case #${displayCaseNumber}] 📚 Загрузка структуры разделов BookStack (книги и главы)...`);
      const availableContext = await this.bookStackService.getAvailableContext(baseUrl, tokenId, tokenSecret);
      console.log(`[Omnidesk Webhook] [Case #${displayCaseNumber}] Загружено для контекста: ${availableContext.books.length} книг, ${availableContext.chapters.length} глав.`);

      // 4. Синтез статьи в Gemini
      console.log(`[Omnidesk Webhook] [Case #${displayCaseNumber}] 🤖 Запуск многостадийного синтеза статьи через Gemini...`);
      const ticketStaffUrl = ticketData.ticketUrl || `https://${domain}.omnidesk.ru/staff/cases/${actualNumericId}`;
      const articleResult = await this.geminiService.generateArticle(
        geminiKey,
        ticketData.content,
        'Преобразуйте данный закрытый тикет технической поддержки в структурированную статью базы знаний Wiki с описанием инцидента, первопричины, пошагового решения и рекомендаций.',
        'create',
        availableContext,
        'gemini-2.5-flash',
        '', // existingContent
        '', // systemInstruction
        '', // dataStructure
        ticketData.attachments,
        undefined, // previousChat
        undefined, // retrievedContext
        { url: ticketStaffUrl, number: String(displayCaseNumber) }
      );

      const articleTitle = articleResult.title || `Решение инцидента #${displayCaseNumber}`;
      console.log(`[Omnidesk Webhook] [Case #${displayCaseNumber}] ✅ Статья сгенерирована: "${articleTitle}"`);

      // 5. Автономное определение / создание целевой книги и главы
      let targetBookId = articleResult.targetBookId;
      let targetChapterId = articleResult.targetChapterId;
      let targetBookSlug = '';
      let targetBookName = '';

      if (!targetBookId) {
        const newBookTitle = articleResult.newBookName || 'База инцидентов Omnidesk';
        console.log(`[Omnidesk Webhook] [Case #${displayCaseNumber}] 📁 Создание новой книги в BookStack: "${newBookTitle}"...`);
        const createdBook = await this.bookStackService.createBook(baseUrl, tokenId, tokenSecret, newBookTitle, 'Автоматически созданная книга для статей из обращений Omnidesk');
        targetBookId = createdBook.id;
        targetBookSlug = createdBook.slug || '';
        targetBookName = createdBook.name || newBookTitle;
      } else {
        const existingBook = availableContext.books?.find((b: any) => Number(b.id) === Number(targetBookId));
        if (existingBook) {
          targetBookSlug = existingBook.slug || '';
          targetBookName = existingBook.name || '';
        } else {
          try {
            const bookData = await this.bookStackService.getBook(baseUrl, tokenId, tokenSecret, targetBookId);
            targetBookSlug = bookData?.slug || '';
            targetBookName = bookData?.name || '';
          } catch (e: any) {
            console.warn(`[Omnidesk Webhook] [Case #${displayCaseNumber}] Не удалось получить slug книги #${targetBookId}:`, e.message || e);
          }
        }
      }

      let targetChapterName = '';
      if (targetChapterId) {
        const existingChapter = availableContext.chapters?.find((c: any) => Number(c.id) === Number(targetChapterId));
        if (existingChapter) {
          targetChapterName = existingChapter.name || '';
        }
      } else if (articleResult.newChapterName && targetBookId) {
        console.log(`[Omnidesk Webhook] [Case #${displayCaseNumber}] 📂 Создание новой главы в BookStack: "${articleResult.newChapterName}" (Книга ID: ${targetBookId})...`);
        const createdChapter = await this.bookStackService.createChapter(baseUrl, tokenId, tokenSecret, targetBookId, articleResult.newChapterName);
        targetChapterId = createdChapter.id;
        targetChapterName = createdChapter.name || articleResult.newChapterName;
      }

      // 6. Публикация статьи в BookStack
      const tags = Array.isArray(articleResult.tags) ? [...articleResult.tags] : [];
      if (!tags.includes('Omnidesk')) tags.push('Omnidesk');
      tags.push(`Case-#${displayCaseNumber}`);
      if (!tags.includes('сгенерировано автоматически')) tags.push('сгенерировано автоматически');
      if (!tags.includes('AutoGenerated')) tags.push('AutoGenerated');

      console.log(`[Omnidesk Webhook] [Case #${displayCaseNumber}] 📝 Публикация страницы в BookStack (Книга ID: ${targetBookId}, Глава ID: ${targetChapterId || 'корень книги'})...`);
      const createdPage = await this.bookStackService.createPage(
        baseUrl,
        tokenId,
        tokenSecret,
        targetBookId,
        targetChapterId,
        articleTitle,
        articleResult.markdown,
        tags,
        articleResult.description
      );

      // Формирование канонического URL страницы в BookStack: /books/{book-slug}/page/{page-slug}
      const cleanBaseUrl = baseUrl.replace(/\/$/, '');
      const pageSlug = createdPage?.slug;

      // Если slug книги почему-то не найден в кэше, запрашиваем книгу повторно
      if (!targetBookSlug && targetBookId) {
        try {
          const bookInfo = await this.bookStackService.getBook(baseUrl, tokenId, tokenSecret, targetBookId);
          targetBookSlug = bookInfo?.slug || '';
          if (!targetBookName) targetBookName = bookInfo?.name || '';
        } catch (e: any) {
          console.warn(`[Omnidesk Webhook] [Case #${displayCaseNumber}] Ошибка запроса книги для slug:`, e.message || e);
        }
      }

      const pageUrl = (targetBookSlug && pageSlug)
        ? `${cleanBaseUrl}/books/${targetBookSlug}/page/${pageSlug}`
        : (createdPage?.url || `${cleanBaseUrl}/link/${createdPage.id}`);

      console.log(`[Omnidesk Webhook] [Case #${displayCaseNumber}] 🎉 Статья успешно опубликована в BookStack! URL: ${pageUrl}`);

      // 7. Обратная связь в Omnidesk (Внутренняя заметка + тег wiki-created)
      const chapterPartText = targetChapterName ? `, Глава «${targetChapterName}»` : (targetChapterId ? `, Глава #${targetChapterId}` : '');
      const chapterPartHtml = targetChapterName ? `, Глава «<b>${this.escapeHtml(targetChapterName)}</b>»` : (targetChapterId ? `, Глава #${targetChapterId}` : '');
      const bookPartText = targetBookName ? `«${targetBookName}»` : `#${targetBookId}`;
      const bookPartHtml = targetBookName ? `«<b>${this.escapeHtml(targetBookName)}</b>»` : `#${targetBookId}`;

      // Текстовая версия без Markdown-скобок, чтобы Omnidesk не портил ссылку знаками )**
      const noteText = `🤖 Bridge.LM: На основе данного обращения создана статья в базе знаний BookStack:\n\n` +
        `Статья: ${articleTitle}\n` +
        `Ссылка: ${pageUrl}\n\n` +
        `📌 Раздел: Книга ${bookPartText}${chapterPartText}\n` +
        `🏷️ Теги: ${tags.join(', ')}`;

      // HTML-версия с прямой кликабельной ссылкой
      const noteHtml = `<p>🤖 <b>Bridge.LM:</b> На основе данного обращения создана статья в базе знаний BookStack:</p>` +
        `<p>📖 <b><a href="${pageUrl}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(articleTitle)}</a></b></p>` +
        `<p>🔗 <a href="${pageUrl}" target="_blank" rel="noopener noreferrer">${pageUrl}</a></p>` +
        `<p>📌 <b>Раздел:</b> Книга ${bookPartHtml}${chapterPartHtml}</p>` +
        `<p>🏷️ <b>Теги:</b> ${this.escapeHtml(tags.join(', '))}</p>`;

      console.log(`[Omnidesk Webhook] [Case #${displayCaseNumber}] 💬 Добавление внутренней заметки в тикет Omnidesk...`);
      await this.omnideskService.addNote(domain, email, apiKey, actualNumericId, noteText, noteHtml);

      console.log(`[Omnidesk Webhook] [Case #${displayCaseNumber}] 🏷️ Добавление тега "wiki-created" в тикет Omnidesk...`);
      await this.omnideskService.addTag(domain, email, apiKey, actualNumericId, 'wiki-created');

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✨ [Omnidesk Webhook] [Case #${displayCaseNumber}] Полный цикл автосинхронизации успешно завершен за ${elapsed}с.`);
      console.log(`==================================================\n`);


    } catch (procError: any) {
      console.error(`[Omnidesk Webhook] [Case #${caseId}] ❌ Ошибка обработки тикета:`, procError.message || procError);
    } finally {
      this.activeProcessingCases.delete(caseId);
    }
  }

  // --- API обертка для отправки статьи на генерацию AI агентом ---

  public handleAgentSubmit = async (req: Request, res: Response): Promise<any> => {
    try {
      const settings = this.settingsService.getSettings();
      
      // Auth via secret (optional but recommended)
      const expectedSecret = process.env.AGENT_API_SECRET || (settings as any).agentApiSecret;
      const providedSecret = req.headers['x-agent-secret'] || req.body?.secret || req.query?.secret;
      
      if (expectedSecret && providedSecret !== expectedSecret) {
        return res.status(401).json({ error: 'Unauthorized: Invalid secret' });
      }

      const { content, goal, source, tags, generateOnly, model } = req.body;
      
      if (!content) {
        return res.status(400).json({ error: 'Параметр content обязателен' });
      }

      const generationModel = model || 'gemini-2.5-flash';

      // Если агент хочет только получить сгенерированный маркдаун без публикации (синхронно)
      if (generateOnly) {
        const geminiKey = settings.geminiApiKey && settings.geminiApiKey !== 'SERVER_MANAGED' ? settings.geminiApiKey : process.env.GEMINI_API_KEY;
        if (!geminiKey) return res.status(500).json({ error: 'Gemini API key not configured' });

        const targetGoal = goal || 'Преобразуйте предоставленные данные в структурированную статью базы знаний Wiki с описанием проблемы и решения.';
        
        const baseUrl = process.env.BOOKSTACK_BASE_URL || settings.bookstack?.baseUrl || settings.bookstack_creds?.baseUrl;
        const tokenId = process.env.BOOKSTACK_TOKEN_ID || settings.bookstack?.tokenId || settings.bookstack_creds?.tokenId;
        const tokenSecret = process.env.BOOKSTACK_TOKEN_SECRET || settings.bookstack?.tokenSecret || settings.bookstack_creds?.tokenSecret;
        
        let availableContext = { books: [], chapters: [], pages: [] };
        if (baseUrl && tokenId && tokenSecret && tokenId !== 'SERVER_MANAGED') {
          try {
            availableContext = await this.bookStackService.getAvailableContext(baseUrl, tokenId, tokenSecret);
          } catch(e) {}
        }

        const articleResult = await this.geminiService.generateArticle(
          geminiKey,
          content,
          targetGoal,
          'create',
          availableContext,
          generationModel,
          '', '', '', [], undefined, undefined,
          source ? { url: '', number: source } : undefined
        );
        
        return res.json({ success: true, article: articleResult });
      }

      // Немедленный ответ 202 для асинхронной обработки и публикации
      const taskId = `agent-task-${Date.now()}`;
      res.status(202).json({
        success: true,
        taskId,
        message: 'Агентский запрос принят в обработку (асинхронная генерация и публикация)'
      });

      // Фоновая генерация и публикация
      this.processAgentTask(taskId, content, goal, source, tags || [], generationModel).catch(err => {
        console.error(`[Agent API] [Task ${taskId}] Error:`, err);
      });
      
    } catch (error: any) {
      console.error('[Agent API Error]', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  };

  private async processAgentTask(taskId: string, content: string, goal?: string, source?: string, customTags: string[] = [], model: string = 'gemini-2.5-flash'): Promise<void> {
    try {
      console.log(`\n==================================================`);
      console.log(`🚀 [Agent API] [Task ${taskId}] Старт обработки...`);

      const settings = this.settingsService.getSettings();
      
      // Credentials
      const baseUrl = process.env.BOOKSTACK_BASE_URL || settings.bookstack?.baseUrl || settings.bookstack_creds?.baseUrl;
      const tokenId = process.env.BOOKSTACK_TOKEN_ID || settings.bookstack?.tokenId || settings.bookstack_creds?.tokenId;
      const tokenSecret = process.env.BOOKSTACK_TOKEN_SECRET || settings.bookstack?.tokenSecret || settings.bookstack_creds?.tokenSecret;
      const geminiKey = settings.geminiApiKey && settings.geminiApiKey !== 'SERVER_MANAGED' ? settings.geminiApiKey : process.env.GEMINI_API_KEY;

      if (!baseUrl || !tokenId || !tokenSecret || tokenId === 'SERVER_MANAGED') {
         throw new Error('BookStack credentials not configured');
      }
      if (!geminiKey) {
         throw new Error('Gemini API key not configured');
      }

      console.log(`[Agent API] [Task ${taskId}] 📚 Загрузка структуры BookStack...`);
      const availableContext = await this.bookStackService.getAvailableContext(baseUrl, tokenId, tokenSecret);

      const targetGoal = goal || 'Преобразуйте предоставленные данные в структурированную статью базы знаний Wiki с описанием проблемы и решения.';
      
      console.log(`[Agent API] [Task ${taskId}] 🤖 Запуск генерации через Gemini...`);
      const articleResult = await this.geminiService.generateArticle(
        geminiKey,
        content,
        targetGoal,
        'create',
        availableContext,
        model,
        '', // existingContent
        '', // systemInstruction
        '', // dataStructure
        [], // attachments
        undefined, 
        undefined,
        source ? { url: '', number: source } : undefined
      );

      const articleTitle = articleResult.title || `Сгенерированная статья (Task ${taskId})`;
      console.log(`[Agent API] [Task ${taskId}] ✅ Статья сгенерирована: "${articleTitle}"`);

      // Book & Chapter logic
      let targetBookId = articleResult.targetBookId;
      let targetChapterId = articleResult.targetChapterId;
      let targetBookSlug = '';

      if (!targetBookId) {
        const newBookTitle = articleResult.newBookName || 'База знаний ИИ';
        console.log(`[Agent API] [Task ${taskId}] 📁 Создание новой книги: "${newBookTitle}"...`);
        const createdBook = await this.bookStackService.createBook(baseUrl, tokenId, tokenSecret, newBookTitle, 'Автоматически созданная книга из API агентов');
        targetBookId = createdBook.id;
        targetBookSlug = createdBook.slug || '';
      }

      if (!targetChapterId && articleResult.newChapterName && targetBookId) {
        console.log(`[Agent API] [Task ${taskId}] 📂 Создание новой главы: "${articleResult.newChapterName}"...`);
        const createdChapter = await this.bookStackService.createChapter(baseUrl, tokenId, tokenSecret, targetBookId, articleResult.newChapterName);
        targetChapterId = createdChapter.id;
      }

      // Publish
      const finalTags = Array.isArray(articleResult.tags) ? [...articleResult.tags] : [];
      finalTags.push('AutoGenerated', 'AI-Agent');
      if (source) finalTags.push(`Source-${source}`);
      for (const t of customTags) {
        if (!finalTags.includes(t)) finalTags.push(t);
      }

      console.log(`[Agent API] [Task ${taskId}] 📝 Публикация страницы...`);
      const createdPage = await this.bookStackService.createPage(
        baseUrl,
        tokenId,
        tokenSecret,
        targetBookId,
        targetChapterId,
        articleTitle,
        articleResult.markdown,
        finalTags,
        articleResult.description
      );

      const cleanBaseUrl = baseUrl.replace(/\/$/, '');
      const pageUrl = (targetBookSlug && createdPage?.slug)
        ? `${cleanBaseUrl}/books/${targetBookSlug}/page/${createdPage.slug}`
        : (createdPage?.url || `${cleanBaseUrl}/link/${createdPage.id}`);

      console.log(`[Agent API] [Task ${taskId}] 🎉 Успешно опубликовано! URL: ${pageUrl}`);
      console.log(`==================================================\n`);

    } catch (e: any) {
      console.error(`[Agent API] [Task ${taskId}] ❌ Ошибка:`, e.message || e);
    }
  }


  public updateSecureSettings = async (req: Request, res: Response): Promise<any> => {
    const { password, geminiApiKey, bookstack, omnidesk } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin';

    if (password !== adminPassword) {
      if (!process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Неверный пароль администратора. Так как переменная ADMIN_PASSWORD не задана в системе, используйте дефолтный пароль "admin" для внесения изменений.' });
      }
      return res.status(401).json({ error: 'Неверный пароль администратора' });
    }

    try {
      const currentSettings = this.settingsService.getSettings();
      const updates: any = {};
      
      if (geminiApiKey !== undefined && geminiApiKey !== 'SERVER_MANAGED') {
        updates.geminiApiKey = geminiApiKey;
      }
      
      if (bookstack) {
        updates.bookstack = { ...currentSettings.bookstack };
        if (bookstack.baseUrl !== undefined) updates.bookstack.baseUrl = bookstack.baseUrl;
        if (bookstack.tokenId !== undefined && bookstack.tokenId !== 'SERVER_MANAGED') updates.bookstack.tokenId = bookstack.tokenId;
        if (bookstack.tokenSecret !== undefined && bookstack.tokenSecret !== 'SERVER_MANAGED') updates.bookstack.tokenSecret = bookstack.tokenSecret;
      }
      
      if (omnidesk) {
        updates.omnidesk = { ...currentSettings.omnidesk };
        if (omnidesk.domain !== undefined) updates.omnidesk.domain = omnidesk.domain;
        if (omnidesk.email !== undefined && omnidesk.email !== 'SERVER_MANAGED') updates.omnidesk.email = omnidesk.email;
        if (omnidesk.apiKey !== undefined && omnidesk.apiKey !== 'SERVER_MANAGED') updates.omnidesk.apiKey = omnidesk.apiKey;
      }

      this.settingsService.updateSettings(updates);
      return res.json({ success: true });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  };

  public verifyAdminPassword = async (req: Request, res: Response): Promise<any> => {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin';

    if (password === adminPassword) {
      return res.json({ success: true });
    }

    if (!process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Неверный пароль администратора. Так как переменная ADMIN_PASSWORD не задана в системе, используйте дефолтный пароль "admin".' });
    }
    return res.status(401).json({ error: 'Неверный пароль администратора' });
  };

  public importSkills = async (req: Request, res: Response): Promise<any> => {
    const { password, url, rawText } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin';

    // Verify admin password
    if (password !== adminPassword) {
      if (!process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Неверный пароль администратора. Так как переменная ADMIN_PASSWORD не задана в системе, используйте дефолтный пароль "admin" для импорта навыков.' });
      }
      return res.status(401).json({ error: 'Неверный пароль администратора' });
    }

    let content = '';
    if (url) {
      try {
        let targetUrl = url.trim();
        // Convert standard GitHub file URL to raw
        if (targetUrl.includes('github.com') && !targetUrl.includes('raw.githubusercontent.com') && !targetUrl.includes('/raw/')) {
          if (targetUrl.endsWith('/')) targetUrl = targetUrl.slice(0, -1);
          if (!targetUrl.endsWith('.md') && !targetUrl.includes('/blob/')) {
            // If repository or folder link provided, prioritize fetching SKILL.md
            const rawRepoBase = targetUrl.replace('github.com', 'raw.githubusercontent.com');
            const candidateUrls = [
              `${rawRepoBase}/main/SKILL.md`,
              `${rawRepoBase}/master/SKILL.md`,
              `${rawRepoBase}/main/README.md`,
              `${rawRepoBase}/master/README.md`
            ];
            for (const cUrl of candidateUrls) {
              try {
                const cResp = await fetch(cUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                if (cResp.ok) {
                  content = await cResp.text();
                  break;
                }
              } catch (_) {}
            }
          }
          if (!content) {
            targetUrl = targetUrl
              .replace('github.com', 'raw.githubusercontent.com')
              .replace('/blob/', '/');
          }
        }

        if (!content) {
          const response = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });

          if (!response.ok) {
            return res.status(400).json({ error: `Не удалось загрузить URL: статус ${response.status} ${response.statusText}` });
          }
          content = await response.text();
        }

        // Basic strip of script and style blocks if HTML
        if (content.trim().startsWith('<') || targetUrl.toLowerCase().endsWith('.html') || targetUrl.toLowerCase().includes('/html')) {
          content = content
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ');
        }
      } catch (err: any) {
        return res.status(400).json({ error: `Ошибка сетевого запроса при загрузке URL: ${err.message}` });
      }
    } else if (rawText) {
      content = rawText.trim();
    } else {
      return res.status(400).json({ error: 'Укажите URL или предоставьте исходный текст' });
    }

    if (!content || content.length < 10) {
      return res.status(400).json({ error: 'Загруженный контент пустой или слишком короткий для анализа.' });
    }

    // Direct parser for official Agent Skills standard (agentskills.io / SKILL.md)
    const isAgentSkill = (content.startsWith('---') || content.startsWith('\ufeff---')) && 
                         /name:\s*([^\r\n]+)/.test(content) && 
                         /description:\s*([^\r\n]+)/.test(content);
    if (isAgentSkill) {
      const nameMatch = content.match(/name:\s*["']?([^"'\r\n]+)["']?/);
      const descMatch = content.match(/description:\s*["']?([^"'\r\n]+)["']?/);
      const skillName = nameMatch ? nameMatch[1].trim() : `imported-skill-${Date.now()}`;
      const skillDesc = descMatch ? descMatch[1].trim() : 'Описание навыка AgentSkills';

      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const skillDir = path.join(process.cwd(), '.agents', 'skills', skillName);
        await fs.mkdir(skillDir, { recursive: true });
        await fs.writeFile(path.join(skillDir, 'SKILL.md'), content, 'utf8');

        const webSkillDir = path.join(process.cwd(), 'src', 'data', 'skills', 'agentic');
        await fs.mkdir(webSkillDir, { recursive: true });
        await fs.writeFile(path.join(webSkillDir, `${skillName}.md`), content, 'utf8');
      } catch (err) {
        console.warn('[ApiController] Could not persist skill file:', err);
      }

      const importedSkill = {
        id: skillName,
        name: skillName.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        description: skillDesc,
        badge: 'AgentSkills.io',
        iconName: 'Sparkles'
      };

      return res.json({ success: true, skills: [importedSkill] });
    }

    try {
      const settings = this.settingsService.getSettings();
      const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || '';
      if (!apiKey) {
        return res.status(400).json({ error: 'Ключ API Gemini не настроен на сервере. Пожалуйста, укажите его в настройках.' });
      }

      const prompt = `Вы — эксперт по ИИ-агентам и системным инструкциям (system prompts).
Ваша задача — проанализировать переданный контент (это может быть репозиторий GitHub, спецификация API NVIDIA NIM, описание ИИ-модели, документация или технический текст) и извлечь, синтезировать или создать на его основе один или несколько высококачественных пользовательских навыков (Agent Skills) для нашего ИИ-агента.

Каждый навык должен представлять собой полезное умение ИИ-агента, снабженное четкой, структурированной системной инструкцией на РУССКОМ языке.

Пожалуйста, верните результат в формате JSON-массива объектов со следующей схемой:
[
  {
    "id": "строка, уникальный идентификатор в формате 'custom-skill-XXXXXX', где XXXXXX - случайные цифры или буквы",
    "name": "строка, понятное название навыка на русском языке (например, 'NVIDIA Llama Аналитик' или 'GitHub Релиз Трекер')",
    "badge": "строка, категория или источник (например, 'GitHub', 'NVIDIA NIM', 'API', 'Аналитика')",
    "description": "строка, детальное описание/системная инструкция для Агента на русском языке. Это должна быть четкая инструкция, объясняющая Агенту, КАК именно он должен себя вести и выполнять данный навык. Используйте профессиональный, директивный тон (например: 'При активации этого навыка вы должны... Всегда форматируйте... Оценивайте...')",
    "iconName": "строка, одна из предложенных иконок: Brain, Cpu, Database, Terminal, Activity, Layers, Sparkles, Wand2, FileSpreadsheet"
  }
]

Пожалуйста, отвечайте СТРОГО в формате JSON-массива. Не пишите никаких дополнительных пояснений, введений или Markdown-разметки (никаких \`\`\`json). Начните ответ сразу с символа '['.

Контент для анализа:
---
${content.substring(0, 15000)}
---`;

      const response = await this.geminiService.generateContent(apiKey, 'gemini-3.7-flash', [{ text: prompt }]);
      const text = response.text || '';

      let skills: any[] = [];
      try {
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        const cleanJson = jsonMatch ? jsonMatch[1] : text;
        skills = JSON.parse(cleanJson.trim());
      } catch (e) {
        const firstBracket = text.indexOf('[');
        const lastBracket = text.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
          skills = JSON.parse(text.substring(firstBracket, lastBracket + 1));
        } else {
          throw new Error('Не удалось спарсить JSON-ответ от Gemini. Ответ ИИ: ' + text);
        }
      }

      if (!Array.isArray(skills)) {
        if (typeof skills === 'object' && skills !== null) {
          skills = [skills];
        } else {
          return res.status(422).json({ error: 'ИИ вернул некорректный формат данных (ожидался массив навыков).' });
        }
      }

      const validSkills = skills.map((s, idx) => {
        return {
          id: s.id || `custom-skill-import-${Date.now()}-${idx}`,
          name: s.name || 'Импортированный навык',
          description: s.description || s.prompt || 'Описание отсутствует',
          badge: s.badge || 'Импорт',
          iconName: ['Brain', 'Cpu', 'Database', 'Terminal', 'Activity', 'Layers', 'Sparkles', 'Wand2', 'FileSpreadsheet'].includes(s.iconName) 
            ? s.iconName 
            : 'Brain'
        };
      });

      return res.json({ success: true, skills: validSkills });
    } catch (e: any) {
      console.error('[ApiController] Failed to import skills:', e.message || e);
      return res.status(500).json({ error: `Ошибка синтеза навыков через ИИ: ${e.message}` });
    }
  };

  private extractPdfMetadata(buffer: Buffer): any {
    const text = buffer.toString('binary');
    const metadata: any = {
      title: '',
      author: '',
      creationDate: ''
    };
    
    const titleMatch = text.match(/\/Title\s*\(([^)]+)\)/);
    if (titleMatch) {
      metadata.title = this.cleanPdfString(titleMatch[1]);
    }
    
    const authorMatch = text.match(/\/Author\s*\(([^)]+)\)/);
    if (authorMatch) {
      metadata.author = this.cleanPdfString(authorMatch[1]);
    }
    
    const dateMatch = text.match(/\/CreationDate\s*\(([^)]+)\)/);
    if (dateMatch) {
      let dateStr = this.cleanPdfString(dateMatch[1]);
      if (dateStr.startsWith('D:')) {
        const match = dateStr.match(/^D:(\d{4})(\d{2})(\d{2})/);
        if (match) {
          dateStr = `${match[3]}.${match[2]}.${match[1]}`;
        }
      }
      metadata.creationDate = dateStr;
    }
    
    return metadata;
  }

  private cleanPdfString(str: string): string {
    let cleaned = str.replace(/\\([\s\S])/g, '$1');
    cleaned = cleaned.replace(/\0/g, '');
    if (cleaned.startsWith('\xfe\xff') || cleaned.startsWith('\xff\xfe')) {
      cleaned = cleaned.slice(2).replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
    }
    return cleaned.trim();
  }

  private escapeHtml(str: string): string {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
