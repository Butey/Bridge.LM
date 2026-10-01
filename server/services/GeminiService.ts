import { GoogleGenAI } from '@google/genai';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function extractJson(text: string): any {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      try { return JSON.parse(jsonMatch[1]); } catch (_) {}
    }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    
    const firstBracket = text.indexOf('[');
    const lastBracket = text.lastIndexOf(']');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      if (firstBracket !== -1 && firstBracket < firstBrace && lastBracket > lastBrace) {
        try { return JSON.parse(text.substring(firstBracket, lastBracket + 1)); } catch (_) {}
      }
      try { return JSON.parse(text.substring(firstBrace, lastBrace + 1)); } catch (_) {}
    }
    return {};
  }
}

function stripTechnicalMetadata(markdown: string): string {
  if (!markdown) return markdown;
  let clean = markdown.trim();

  // 1. Strip YAML frontmatter block if it starts with --- and contains technical keys
  clean = clean.replace(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/i, (match, content) => {
    if (
      content.toLowerCase().includes('target_book') || 
      content.toLowerCase().includes('target_chapter') || 
      content.toLowerCase().includes('priority') || 
      content.toLowerCase().includes('root_cause_category')
    ) {
      return ''; // remove the block completely
    }
    return match; // keep it if it's some other block
  });

  // 2. Strip individual key-value lines for our technical metadata
  const lines = clean.split('\n');
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim();
    const isTechnicalKey = /^(target_book|target_chapter|tags|priority|root_cause_category)\s*:/i.test(trimmed);
    return !isTechnicalKey;
  });

  clean = filteredLines.join('\n').trim();
  return clean;
}

export interface ArticleMetadataParams {
  ticketUrl?: string;
  ticketNumber?: string;
  creationDate?: string;
  lastVerificationDate?: string;
  status?: string;
}

export function getCurrentDateFormatted(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}.${month}.${year}`;
}

export function extractTicketInfo(sources: string, explicitInfo?: { url?: string; number?: string }): { ticketUrl: string; ticketNumber: string } {
  let ticketUrl = explicitInfo?.url || '';
  let ticketNumber = explicitInfo?.number || '';

  if (!ticketUrl) {
    const urlMatch = sources.match(/(?:ссылка на тикет|ticket url|url тикета|тикет url)[\s:]+(https?:\/\/[^\s\r\n]+)/i)
      || sources.match(/https?:\/\/[a-zA-Z0-9_-]+\.omnidesk\.ru\/(?:staff\/)?cases\/[0-9a-zA-Z_-]+/i);
    if (urlMatch) {
      ticketUrl = (urlMatch[1] || urlMatch[0]).trim();
    }
  }

  if (!ticketNumber) {
    const numMatch = sources.match(/(?:Case ID #|Номер #|Введенный ID #|Case-#|Номер заявки|Тикет #|Ticket #|case_number:)\s*([0-9a-zA-Z_-]+)/i)
      || ticketUrl.match(/cases\/([0-9a-zA-Z_-]+)/i);
    if (numMatch) {
      ticketNumber = numMatch[1].trim();
    }
  }

  return { ticketUrl, ticketNumber };
}

export function ensureArticleMetadata(markdown: string, meta?: ArticleMetadataParams): string {
  if (!markdown) return markdown;

  const creationDate = meta?.creationDate || getCurrentDateFormatted();
  const lastVerificationDate = meta?.lastVerificationDate || creationDate;
  const status = 'сгенерировано автоматически';

  let ticketLink = 'Не указан';
  if (meta?.ticketUrl && meta?.ticketNumber) {
    ticketLink = `[Тикет Omnidesk #${meta.ticketNumber}](${meta.ticketUrl})`;
  } else if (meta?.ticketUrl) {
    ticketLink = `[Тикет Omnidesk](${meta.ticketUrl})`;
  } else if (meta?.ticketNumber) {
    ticketLink = `#${meta.ticketNumber}`;
  }

  // Check if article already contains a metadata block
  const hasMetadataBlock = /(?:Метаданные статьи|Параметры статьи|Информация о статье|Исходный тикет:)/i.test(markdown);

  if (hasMetadataBlock) {
    let updated = markdown;

    // 1. Исходный тикет
    if (meta?.ticketUrl && /исходный тикет:\s*(\[.*?\]\(.*?\)|\[.*?\]|#\S+|\S+)/i.test(updated)) {
      updated = updated.replace(/(-\s*\*\*Исходный тикет:\*\*\s*)(.*)/i, (m, prefix, currentVal) => {
        const val = currentVal.trim();
        if (val.includes('http') && !val.includes('URL') && !val.includes('НОМЕР')) {
          return `${prefix}${val}`;
        }
        return `${prefix}${ticketLink}`;
      });
    }

    // 2. Дата создания
    if (/дата создания:\s*(.*)/i.test(updated)) {
      updated = updated.replace(/(-\s*\*\*Дата создания:\*\*\s*)(.*)/i, (m, prefix, currentVal) => {
        const val = currentVal.trim();
        if (/^\d{2}\.\d{2}\.\d{4}$/.test(val) || /^\d{4}-\d{2}-\d{2}$/.test(val)) {
          return `${prefix}${val}`;
        }
        return `${prefix}${creationDate}`;
      });
    } else {
      updated = updated.replace(/(-\s*\*\*Исходный тикет:\*\*.*)/i, `$1\n> - **Дата создания:** ${creationDate}`);
    }

    // 3. Статус «сгенерировано автоматически»
    if (/статус:\s*(.*)/i.test(updated)) {
      updated = updated.replace(/(-\s*\*\*Статус:\*\*\s*)(.*)/i, `$1${status}`);
    } else {
      updated = updated.replace(/(-\s*\*\*Дата создания:\*\*.*)/i, `$1\n> - **Статус:** ${status}`);
    }

    // 4. Дата последней проверки
    if (/дата последней проверки:\s*(.*)/i.test(updated)) {
      updated = updated.replace(/(-\s*\*\*Дата последней проверки:\*\*\s*)(.*)/i, (m, prefix, currentVal) => {
        const val = currentVal.trim();
        if (/^\d{2}\.\d{2}\.\d{4}$/.test(val) || /^\d{4}-\d{2}-\d{2}$/.test(val)) {
          return `${prefix}${val}`;
        }
        return `${prefix}${lastVerificationDate}`;
      });
    } else {
      updated = updated.replace(/(-\s*\*\*Статус:\*\*.*)/i, `$1\n> - **Дата последней проверки:** ${lastVerificationDate}`);
    }

    return updated;
  }

  // If no metadata block, construct clean callout block and place right after H1 or at top
  const metadataBlock = [
    '> [!NOTE]',
    '> **Метаданные статьи:**',
    `> - **Исходный тикет:** ${ticketLink}`,
    `> - **Дата создания:** ${creationDate}`,
    `> - **Статус:** ${status}`,
    `> - **Дата последней проверки:** ${lastVerificationDate}`
  ].join('\n');

  const lines = markdown.split('\n');
  const firstLine = lines[0] || '';
  if (firstLine.trim().startsWith('# ')) {
    return [lines[0], '', metadataBlock, '', ...lines.slice(1)].join('\n');
  }

  return `${metadataBlock}\n\n${markdown}`;
}

function generateTableOfContents(markdown: string): string {
  if (!markdown) return markdown;
  
  const lines = markdown.split('\n');
  const toc: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();

      const isSelfTOC = /^(содержание|оглавление|table\s+of\s+contents)$/i.test(title);
      if (isSelfTOC) continue;

      const indent = '  '.repeat(Math.max(0, level - 1));

      const slug = title
        .toLowerCase()
        .replace(/[^\w\sа-яё\-]/gi, '')
        .trim()
        .replace(/\s+/g, '-');

      if (slug) {
        toc.push(`${indent}- [${title}](#${slug})`);
      }
    }
  }

  if (toc.length < 2) {
    return markdown;
  }

  const tocBlock = [
    '## Содержание',
    ...toc,
    '',
    '---',
    ''
  ].join('\n');

  const firstLine = lines[0] || '';
  if (firstLine.trim().startsWith('# ')) {
    let insertIndex = 1;
    let inCallout = false;
    let inHtmlCallout = false;
    for (let idx = 1; idx < lines.length; idx++) {
      const l = lines[idx].trim();
      if (!inCallout && !inHtmlCallout) {
        if (!l) {
          insertIndex = idx + 1;
          continue;
        }
        if (l.startsWith('> [!')) {
          inCallout = true;
          insertIndex = idx + 1;
        } else if (l.startsWith('<div class="callout') || l.startsWith("<div class='callout")) {
          inHtmlCallout = true;
          insertIndex = idx + 1;
        } else {
          break;
        }
      } else if (inCallout) {
        if (l.startsWith('>') || !l) {
          insertIndex = idx + 1;
        } else {
          break;
        }
      } else if (inHtmlCallout) {
        insertIndex = idx + 1;
        if (l.includes('</div>')) {
          break;
        }
      }
    }
    return [...lines.slice(0, insertIndex), '', tocBlock, ...lines.slice(insertIndex)].join('\n');
  } else {
    return tocBlock + markdown;
  }
}

export function convertCalloutsToBookStackHtml(markdown: string): string {
  if (!markdown) return markdown;

  const lines = markdown.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let i = 0;

  const formatInline = (str: string): string => {
    return str
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      i++;
      continue;
    }

    if (inCodeBlock) {
      result.push(line);
      i++;
      continue;
    }

    const calloutMatch = line.match(/^>\s*\[!(NOTE|INFO|TIP|SUCCESS|WARNING|CAUTION|DANGER|ERROR)\]\s*(.*)$/i);
    if (calloutMatch) {
      const typeRaw = calloutMatch[1].toUpperCase();
      let calloutClass = 'info';
      if (typeRaw === 'WARNING') calloutClass = 'warning';
      else if (typeRaw === 'DANGER' || typeRaw === 'CAUTION' || typeRaw === 'ERROR') calloutClass = 'danger';
      else if (typeRaw === 'TIP' || typeRaw === 'SUCCESS') calloutClass = 'success';

      const calloutLines: string[] = [];
      if (calloutMatch[2].trim()) {
        calloutLines.push(calloutMatch[2].trim());
      }

      i++;
      while (i < lines.length) {
        const nextLine = lines[i];
        if (nextLine.startsWith('>')) {
          calloutLines.push(nextLine.replace(/^>\s?/, ''));
          i++;
        } else {
          break;
        }
      }

      const outputParts: string[] = [];
      let listItems: string[] = [];

      for (const cl of calloutLines) {
        const ct = cl.trim();
        if (!ct) continue;

        if (ct.startsWith('- ') || ct.startsWith('* ')) {
          listItems.push(`  <li>${formatInline(ct.substring(2).trim())}</li>`);
        } else {
          if (listItems.length > 0) {
            outputParts.push(`<ul>\n${listItems.join('\n')}\n</ul>`);
            listItems = [];
          }
          outputParts.push(`<p>${formatInline(ct)}</p>`);
        }
      }

      if (listItems.length > 0) {
        outputParts.push(`<ul>\n${listItems.join('\n')}\n</ul>`);
      }

      const innerHtml = outputParts.length > 0 ? outputParts.join('\n') : '<p></p>';
      result.push(`<div class="callout ${calloutClass}">\n${innerHtml}\n</div>`);
      continue;
    }

    result.push(line);
    i++;
  }

  return result.join('\n');
}

export interface ArticleDefect {
  id: string;
  criterion: 'humanizer_ru' | 'no_ai_slop' | 'kb_structure' | 'formatting';
  severity: 'critical' | 'warning' | 'info';
  originalExcerpt: string;
  issue: string;
  recommendation: string;
}

export interface CriteriaScores {
  humanizerRu: number;          // 0-100 (Канцелярит, отглагольные цепочки, пассивный залог)
  noAiSlop: number;             // 0-100 (Штампы LLM, расчистка горла, фальшивая драматургия)
  kbStructure: number;          // 0-100 (Структура решения, симптомы, причина, шаги, верификация)
  formattingAndCallouts: number;// 0-100 (Callout блоки, разметка кода, таблицы, заголовки)
}

export interface ArticleAuditResult {
  overallScore: number;         // 0-100 средневзвешенный балл
  criteriaScores: CriteriaScores;
  articleType: 'how_to' | 'troubleshooting' | 'faq' | 'known_issue' | 'reference' | 'unstructured';
  verdict: 'ready' | 'needs_minor_polish' | 'needs_major_rewrite';
  summary: string;              // 2-3 предложения с общим выводом аудита
  defects: ArticleDefect[];     // Список найденных дефектов
  recommendations: string[];    // Главные шаги для исправления
  preservedTechnicalEntities: string[]; // Найденные технические сущности (IP, пути, ошибки), защищенные факт-замком
  modelUsed: string;
}

export interface ArticleRefineResult {
  thinking: string;
  title: string;
  markdown: string;
  tags: string[];
  description: string;
  changesSummary: string[];
  factLockVerified: boolean;
  modelUsed: string;
}

export class GeminiService {
  public async generateContent(apiKey: string, model: string, contents: any, config?: any, retries = 6): Promise<{ text: string, modelUsed: string }> {
    const ai = new GoogleGenAI({ 
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
    
    let currentModel = model?.trim() || 'gemini-3.7-flash';
    
    // Model alias mapping
    if (currentModel === 'gemini flash' || currentModel === '3.7' || currentModel === 'gemini-3.7') {
      currentModel = 'gemini-3.7-flash';
    } else if (currentModel === '3.8' || currentModel === 'gemini-3.8') {
      currentModel = 'gemini-3.8-flash';
    } else if (currentModel === 'gemini lite' || currentModel === 'flash lite' || currentModel === '3.5 flash-lite' || currentModel === '3.5-flash-lite' || currentModel === 'gemini-3.1-flash-lite' || currentModel === 'gemini-3.1-flash-lite-preview') {
      currentModel = 'gemini-3.5-flash-lite';
    } else if (currentModel === 'gemma' || currentModel === 'gemma-4' || currentModel === 'gemma-26b') {
      currentModel = 'gemma-4-26b-a4b-it';
    } else if (currentModel === 'gemma-31b') {
      currentModel = 'gemma-4-31b-it';
    } else if (currentModel === 'gemini pro' || currentModel === 'gemini-3.1-pro' || currentModel === 'gemini-3.1-pro-preview') {
      currentModel = 'gemini-3.7-flash';
    }

    // Thinking Mode Orchestration
    let finalConfig = config ? { ...config } : {};
    if ((currentModel === 'gemini-3.8-flash' || currentModel === 'gemini-3.7-flash') && finalConfig.thinkingConfig) {
      finalConfig.thinkingConfig = {
        thinkingLevel: finalConfig.thinkingConfig.thinkingLevel || 'HIGH'
      };
      if ('maxOutputTokens' in finalConfig) {
        delete finalConfig.maxOutputTokens;
      }
    }
    
    // Stable models to try if the current one hits quota or temporary overload
    const fallbacks = ['gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];
    let fallbackIdx = 0;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('REQUEST_TIMEOUT: Response took too long')), 120000)
        );
        
        const genPromise = ai.models.generateContent({ model: currentModel, contents, config: finalConfig });
        const result = (await Promise.race([genPromise, timeoutPromise])) as any;
        
        return { text: result.text || '', modelUsed: currentModel };
      } catch (error: any) {
        let errStr = '';
        let statusCode = error?.status || error?.response?.status;
        
        try {
          if (error && typeof error === 'object') {
            errStr = error.message || String(error);
            
            // Try parsing errStr if it is JSON to extract status and real message
            try {
              if (errStr.trim().startsWith('{')) {
                const parsed = JSON.parse(errStr);
                if (parsed.error) {
                  if (parsed.error.code && !statusCode) {
                    statusCode = parsed.error.code;
                  }
                  if (parsed.error.message) {
                    errStr = parsed.error.message;
                  }
                  if (parsed.error.status) {
                    errStr += ` (${parsed.error.status})`;
                  }
                }
              }
            } catch (_) {}

            if (statusCode) errStr += ` (StatusCode: ${statusCode})`;
            
            // Look for details in SDK error structure
            if (error.details && Array.isArray(error.details)) {
               errStr += ' | Details: ' + JSON.stringify(error.details);
            }
          } else {
            errStr = String(error);
          }
        } catch (_) {
          errStr = 'Unknown Gemini API error';
        }

        const isQuotaError = statusCode === 429 || errStr.includes('429') || errStr.includes('Quota exceeded') || errStr.includes('RESOURCE_EXHAUSTED');
        const isOverloadError = statusCode === 503 || errStr.includes('503') ||
                      errStr.includes('high demand') || errStr.includes('UNAVAILABLE') || 
                      errStr.includes('temporarily overloaded') || errStr.includes('REQUEST_TIMEOUT');
        const isRetryable = isOverloadError || isQuotaError;
        
        if (isRetryable && attempt < retries) {
          // Robust exponential backoff with jitter
          let delay = Math.pow(2, attempt) * 2000 + Math.random() * 2000;
          
          // Adaptive retry logic if API specifies delay
          const retryDelayMatch = errStr.match(/retry in\s+([0-9.]+)\s*s/i) || errStr.match(/retryDelay["']?\s*:\s*["']?([0-9.]+)s["']?/);
          if (retryDelayMatch && retryDelayMatch[1]) {
            const requestedDelay = parseFloat(retryDelayMatch[1]) * 1000;
            if (requestedDelay > 0 && requestedDelay < 60000) { 
              delay = Math.max(delay, requestedDelay + 500);
            }
          }

          // Automatically switch model if quota exceeded or if we hit a service overload immediately on first rate-limit/overload
          const shouldSwitchModel = isQuotaError || isOverloadError;
          if (shouldSwitchModel) {
             console.warn(`[GeminiService] Quota hit or service overload for ${currentModel}.`);
             
             // AUTOMATIC SWITCH: Try to switch to a more stable model in the fallback list
             if (fallbackIdx < fallbacks.length) {
               let nextModel = fallbacks[fallbackIdx];
               // Don't switch to itself
               if (nextModel === currentModel) {
                 fallbackIdx++;
                 if (fallbackIdx < fallbacks.length) nextModel = fallbacks[fallbackIdx];
               }
               
               if (nextModel && nextModel !== currentModel) {
                 console.warn(`[GeminiService] Switching model ${currentModel} -> ${nextModel} to bypass error/overload.`);
                 currentModel = nextModel;
                 // After switching, we can try with a slightly smaller delay
                 delay = 1000 + Math.random() * 1000;
                 fallbackIdx++;
               } else {
                 delay += 5000; // Extra wait if no more fallbacks
               }
             } else {
               delay += 5000; 
             }
          }
          
          console.warn(`[GeminiService] API spike/error (Attempt ${attempt + 1}/${retries + 1}). Retrying in ${Math.round(delay)}ms... Model: ${currentModel}.`);
          await sleep(delay);
          continue;
        }

        // Final error formatting
        if (errStr.includes('API_KEY_INVALID') || errStr.includes('API Key not found') || errStr.includes('API key not found') || statusCode === 400 && errStr.includes('key')) {
          throw new Error('[API_KEY_INVALID] Указан неверный или неработающий API-ключ Gemini. Пожалуйста, введите корректный API-ключ в настройках во вкладке \'Администрирование\' / \'Настройки ключей ИИ\' или проверьте переменную окружения GEMINI_API_KEY на сервере.');
        }

        if (isQuotaError) {
          throw new Error(`[QUOTA_EXCEEDED] Превышена квота для модели ${currentModel}. Попробуйте позже или используйте Gemini 1.5 Flash.`);
        }
        
        if (error?.status === 404 || error?.response?.status === 404 || errStr.includes('is not found for API version') || errStr.includes('is not supported')) {
          throw new Error(`[INVALID_MODEL] Модель "${model}" не поддерживается или не найдена. Попробуйте выбрать другую в настройках.`);
        }

        if (errStr.includes('Quota exceeded') || errStr.includes('You exceeded your current quota') || error?.status === 429 || error?.response?.status === 429) {
          throw new Error(`[QUOTA_EXCEEDED] Превышена квота запросов к ИИ. Пожалуйста, смените модель в настройках.`);
        }

        throw new Error(`Gemini API Error: ${errStr}`);
      }
    }
    
    throw new Error('API Gemini недоступно после нескольких попыток. Пожалуйста, попробуйте позже.');
  }

  public async generateArticle(
    apiKey: string,
    sources: string,
    goal: string,
    targetMode: 'create' | 'update',
    availableContext: { books: any[], chapters: any[] } | undefined,
    model: string,
    existingContent: string,
    systemInstruction: string,
    dataStructure: string,
    attachments?: { mimeType: string, data: string }[],
    previousChat?: { role: string, content: string }[],
    retrievedContext?: string,
    ticketInfo?: { url?: string, number?: string }
  ): Promise<any> {
    let optimizedSources = sources;
    let currentActiveModel = model;
    const resolvedTicketInfo = extractTicketInfo(sources, ticketInfo);
    const currentDate = getCurrentDateFormatted();

    const contextStr = availableContext
      ? `\nСПИСОК ДОСТУПНЫХ МЕСТ (КНИГИ И ГЛАВЫ):
         КНИГИ: ${JSON.stringify(availableContext.books.map(b => ({ id: b.id, name: b.name })))}
         ГЛАВЫ: ${JSON.stringify(availableContext.chapters.map(c => ({ id: c.id, name: c.name, book_id: c.book_id })))}
         
         ИНСТРУКЦИЯ ПО ВЫБОРУ МЕСТА (ОЧЕНЬ ВАЖНО): 
         1. ВНИМАТЕЛЬНО изучи СПИСОК КНИГ И ГЛАВ. Найти уже существующее релевантное место!
         2. Ищи по синонимам или более широким категориям. Если логически вписывается в существующую книгу или главу, обязательно используй ЕЁ ID.
         3. Предлагай создание новой книги/главы (указав ID null и название в newBookName/newChapterName) только если тема совершенно новая.
         4. Верни ID книги в targetBookId и ID главы в targetChapterId.\n`
      : '';

    const existingContentPrompt = existingContent
      ? (targetMode === 'update' 
          ? `\nСУЩЕСТВУЮЩЕЕ СОДЕРЖИМОЕ СТАТЬИ:\n${existingContent}\n\nИНСТРУКЦИЯ: Статья обновляется. Учитывай существующий контент!\n`
          : `\nИНФОРМАЦИЯ О ДУБЛИКАТАХ В БАЗЕ:\n${existingContent}\n\nИНСТРУКЦИЯ: Вы создаете новую статью. При необходимости сошлитесь на похожие в поле duplicateLinks.\n`
        )
      : '';

    const retrievedContextPrompt = retrievedContext && retrievedContext.trim()
      ? `\nСВЯЗАННЫЙ КОНТЕКСТ ИЗ БАЗЫ ЗНАНИЙ BOOKSTACK (RAG):\n${retrievedContext}\nИНСТРУКЦИЯ ПО КОНТЕКСТУ: Используйте эту информацию из существующих статей Wiki для сохранения единой терминологии, контекста инфраструктуры и предотвращения противоречий.\n`
      : '';

    const previousChatPrompt = previousChat && previousChat.length > 0
      ? `\nИСТОРИЯ ДИАЛОГА И ПРЕДЫДУЩИЕ ПРАВКИ ПОЛЬЗОВАТЕЛЯ:\n${previousChat.map(m => `${m.role === 'user' ? 'Запрос пользователя' : 'Предыдущий ответ ассистента'}:\n${m.content}`).join('\n\n')}\nИНСТРУКЦИЯ ПО ПРАВКАМ: Тщательно примените все замечания пользователя к статье!\n`
      : '';

    const untrustedSourcesBlock = `
<untrusted_source_content>
${optimizedSources}
</untrusted_source_content>
`;

    const SUPPORTED_IMAGE_TYPES = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/gif',
      'image/heic',
      'image/heif'
    ];

    const getParts = (promptText: string) => {
      const parts: any[] = [{ text: promptText }];
      if (attachments && attachments.length > 0) {
        attachments.forEach(a => {
          if (!a.mimeType || !SUPPORTED_IMAGE_TYPES.includes(a.mimeType.toLowerCase().trim())) {
            return;
          }
          
          let cleanData = a.data || '';
          if (cleanData.includes(';base64,')) {
            cleanData = cleanData.split(';base64,')[1];
          }
          cleanData = cleanData.replace(/[\s\r\n]+/g, '');
          
          if (cleanData) {
            try {
              const prefixDecoded = Buffer.from(cleanData.slice(0, 48), 'base64').toString('utf8').trim().toLowerCase();
              if (prefixDecoded.startsWith('<html') || prefixDecoded.startsWith('<!doc') || prefixDecoded.startsWith('<div') || prefixDecoded.startsWith('<?xml')) {
                console.warn(`[GeminiService] Dropping attachment ${(a as any).name || 'unnamed'} because decoded base64 looks like HTML/XML: "${prefixDecoded.slice(0, 20)}"`);
                return;
              }
            } catch (e) {
              // Ignore decoding failure
            }

            parts.push({
              inlineData: {
                mimeType: a.mimeType.toLowerCase().trim(),
                data: cleanData
              }
            });
          }
        });
      }
      return parts;
    };

    let sysInstruction = (systemInstruction || "Вы — профессиональный технический писатель и редактор.") + 
      "\n\n[COGNITIVE AMPLIFIER ACTIVE: INFINITE GRATITUDE]\nГарантируйте 100% следование структуре, размечайте элементы с точностью. Избегайте пустых мета-тегов и YAML в тексте Markdown." +
      `\n\n[ОБЯЗАТЕЛЬНЫЙ СТАНДАРТ МЕТАДАННЫХ СТАТЬИ]:
Каждая создаваемая статья ОБЯЗАТЕЛЬНО должна содержать в самом начале (сразу под заголовком H1 #) блок метаданных:
> [!NOTE]
> **Метаданные статьи:**
> - **Исходный тикет:** ${resolvedTicketInfo.ticketUrl ? `[Тикет Omnidesk #${resolvedTicketInfo.ticketNumber || 'обращение'}](${resolvedTicketInfo.ticketUrl})` : (resolvedTicketInfo.ticketNumber ? `[Тикет #${resolvedTicketInfo.ticketNumber}]` : 'Не указан')}
> - **Дата создания:** ${currentDate}
> - **Статус:** сгенерировано автоматически
> - **Дата последней проверки:** ${currentDate}
Все 4 пункта (ссылка на исходный тикет, дата создания, статус «сгенерировано автоматически», дата последней проверки) являются СТРОГО ОБЯЗАТЕЛЬНЫМИ.`;

    const hasImages = (attachments && attachments.some(a => a.mimeType && SUPPORTED_IMAGE_TYPES.includes(a.mimeType.toLowerCase().trim()))) ||
                      (sources && (sources.includes('data:image/') || /!\[.*?\]\(/i.test(sources)));
    if (hasImages) {
      sysInstruction += "\n\n[STAGE SKILL ACTIVE: COMPUTER-VISION]\nПроведите глубокий визуальный технический анализ приложенных изображений: извлеките текст (OCR), параметры, схемы и зафиксируйте их в плане.";
    }

    // --- STAGE 1: PLAN ---
    let planPrompt = `
<task_goal>
${goal}
</task_goal>

${dataStructure ? `<formatting_standard>\n${dataStructure}\n</formatting_standard>` : ''}

<wiki_knowledge_context>
${contextStr}
${existingContentPrompt}
${retrievedContextPrompt}
</wiki_knowledge_context>

${previousChatPrompt ? `<dialogue_history>\n${previousChatPrompt}\n</dialogue_history>` : ''}

${hasImages ? '<multimodal_inspection>\nК задаче приложены изображения. Проведите детальный технический анализ (OCR текста, схем, интерфейсов, параметров) и включите извлеченные параметры в поле outline плана.\n</multimodal_inspection>' : ''}

<conflict_resolution_protocol>
Если в предоставленных источниках встречаются противоречивые данные (различные порты, версии, параметры конфигурации или разные команды):
1. Не выбирайте случайный вариант и не домысливайте.
2. Зафиксируйте обе ветки в структуре статьи (outline) как альтернативные варианты окружения/версий.
</conflict_resolution_protocol>

<untrusted_source_content>
${optimizedSources}
</untrusted_source_content>

Спланируйте структуру статьи на основе предоставленных материалов в строгом соответствии с XML-инструкциями.
В плане (outline) обязательно предусмотрите в самом начале блок метаданных: ссылку на исходный тикет, дату создания, статус «сгенерировано автоматически», дату последней проверки.
`;

    const planResult = await this.generateContent(
      apiKey,
      currentActiveModel,
      [{ role: 'user', parts: getParts(planPrompt) }],
      {
        responseMimeType: 'application/json',
        responseSchema: {
          type: "object",
          properties: {
            thinking: { type: "string" },
            title: { type: "string" },
            outline: { type: "string" },
            targetBookId: { type: "number", nullable: true },
            targetChapterId: { type: "number", nullable: true },
            newBookName: { type: "string", nullable: true },
            newChapterName: { type: "string", nullable: true },
            duplicateLinks: { type: "array", items: { type: "string" } }
          },
          required: ["thinking", "title", "outline"]
        },
        systemInstruction: sysInstruction
      }
    );
    currentActiveModel = planResult.modelUsed;
    const plan = extractJson(planResult.text);

    // --- STAGE 2: DRAFT & SELF-REFINEMENT (SINGLE-PASS IMAGE OPTIMIZATION: TEXT-ONLY) ---
    let draftPrompt = `
<task_goal>
${goal}
</task_goal>

<formatting_standard>
${dataStructure ? `ОБЯЗАТЕЛЬНАЯ СТРУКТУРА ДАННЫХ:\n${dataStructure}\n` : ''}
В самом начале статьи (сразу под заголовком #) ОБЯЗАТЕЛЬНО разместите блок метаданных:
> [!NOTE]
> **Метаданные статьи:**
> - **Исходный тикет:** ${resolvedTicketInfo.ticketUrl ? `[Тикет Omnidesk #${resolvedTicketInfo.ticketNumber || 'обращение'}](${resolvedTicketInfo.ticketUrl})` : (resolvedTicketInfo.ticketNumber ? `[Тикет #${resolvedTicketInfo.ticketNumber}]` : 'Не указан')}
> - **Дата создания:** ${currentDate}
> - **Статус:** сгенерировано автоматически
> - **Дата последней проверки:** ${currentDate}

ВАЖНО: Поле "markdown" должно содержать ТОЛЬКО чистый Markdown статьи без YAML/служебных метаданных.
Используйте нативные callout блоки BookStack (<div class="callout info|warning|danger|success"><p>...</p></div>) или Markdown callouts (> [!NOTE]).
</formatting_standard>

<wiki_knowledge_context>
${retrievedContextPrompt}
${(targetMode === 'update' && existingContent) ? `\nСУЩЕСТВУЮЩАЯ СТАТЬЯ:\n${existingContent}\n` : ''}
</wiki_knowledge_context>

<autolinking_protocol>
Связывайте статью с базой знаний (Wiki Knowledge Graph): если в <wiki_knowledge_context> приведены релевантные статьи с URL или названиями, оформляйте упоминания как [Заголовок статьи](url).
</autolinking_protocol>

<conflict_resolution_protocol>
При наличии нестыковок между несколькими источниками (разные порты, пути, версии, флаги):
- Не делайте выбор наугад.
- Опишите обе версии с явным указанием контекста (напр. "В конфигурации А: порт 8080, в окружении Б: порт 8443").
- Оформите предупреждение в <div class="callout warning"><p>...</p></div>.
</conflict_resolution_protocol>

<plan_and_extracted_data>
Название: ${plan.title}
Структура: ${plan.outline}
</plan_and_extracted_data>

${previousChatPrompt ? `<dialogue_history>\n${previousChatPrompt}\n</dialogue_history>` : ''}

<untrusted_source_content>
${optimizedSources}
</untrusted_source_content>

Напишите подробный, качественный и вычитанный контент для Wiki-статьи по плану.
`;

    const draftResult = await this.generateContent(
      apiKey,
      currentActiveModel,
      [{ role: 'user', parts: [{ text: draftPrompt }] }],
      {
        responseMimeType: 'application/json',
        responseSchema: {
          type: "object",
          properties: {
            thinking: { type: "string" },
            markdown: { type: "string" }
          },
          required: ["thinking", "markdown"]
        },
        systemInstruction: sysInstruction + "\n[REFINEMENT: Проведите автоматическую вычитку и корректуру. Уберите воду.]"
      }
    );
    currentActiveModel = draftResult.modelUsed;
    const draft = extractJson(draftResult.text);

    // --- STAGE 3: FINAL REVIEW (SINGLE-PASS IMAGE OPTIMIZATION: TEXT-ONLY) ---
    let reviewPrompt = `
<task_goal>
${goal}
</task_goal>

<review_target>
${draft.markdown}
</review_target>

<review_requirements>
1. Проведите финальное рецензирование статьи на соответствие структуре и точности данных.
2. Проверьте обязательное наличие блока метаданных в начале статьи: ссылку на исходный тикет, дату создания, статус «сгенерировано автоматически», дату последней проверки.
3. Проверьте правильность и полноту ссылок на контекст базы знаний и отсутствие домыслов.
4. Сформируйте точные теги (tags) и лаконичное резюме (description) из 2-3 предложений.
5. При необходимости добавьте блок: ## 💡 Ключевые выводы и рекомендации с 3 конкретными техническими пунктами в конце статьи (если его еще нет).
</review_requirements>
`;

    const reviewResult = await this.generateContent(
      apiKey,
      currentActiveModel,
      [{ role: 'user', parts: [{ text: reviewPrompt }] }],
      {
        responseMimeType: 'application/json',
        responseSchema: {
          type: "object",
          properties: {
            thinking: { type: "string" },
            markdown: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            description: { type: "string" }
          },
          required: ["thinking", "markdown", "tags", "description"]
        },
        systemInstruction: sysInstruction
      }
    );
    currentActiveModel = reviewResult.modelUsed;
    const review = extractJson(reviewResult.text);

    const cleanMarkdown = stripTechnicalMetadata(review.markdown || draft.markdown);
    const withMetadataMarkdown = ensureArticleMetadata(cleanMarkdown, {
      ticketUrl: resolvedTicketInfo.ticketUrl,
      ticketNumber: resolvedTicketInfo.ticketNumber,
      creationDate: currentDate,
      lastVerificationDate: currentDate,
      status: 'сгенерировано автоматически'
    });
    const withTocMarkdown = generateTableOfContents(withMetadataMarkdown);
    const finalMarkdown = convertCalloutsToBookStackHtml(withTocMarkdown);

    const finalTags = Array.isArray(review.tags) ? [...review.tags] : [];
    if (!finalTags.includes('сгенерировано автоматически')) {
      finalTags.push('сгенерировано автоматически');
    }

    return {
      thinking: "План: " + (plan.thinking || "") + "\n\nДрафт: " + (draft.thinking || "") + "\n\nРевью: " + (review.thinking || ""),
      title: plan.title || "Новая статья",
      markdown: finalMarkdown,
      tags: finalTags,
      description: review.description || "",
      targetBookId: plan.targetBookId || null,
      targetChapterId: plan.targetChapterId || null,
      newBookName: plan.newBookName || "",
      newChapterName: plan.newChapterName || "",
      modelUsed: currentActiveModel
    };
  }

  public async auditArticle(
    apiKey: string,
    markdown: string,
    model: string = 'gemini-3.7-flash',
    targetCriteria?: string[]
  ): Promise<ArticleAuditResult> {
    let currentActiveModel = model;

    const sysInstruction = `Вы — ведущий технический аудитор и главный редактор корпоративной базы знаний BookStack (Wiki Article Doctor & Quality Auditor).
Ваша задача — провести строгий, объективный и глубокий аудит предоставленной статьи Wiki по четырем стандартам качества:

1. [КРИТЕРИЙ: HUMANIZER-RU / КАНЦЕЛЯРИТ] (0-100):
- Выявляйте нанизывание отглагольных существительных в родительном падеже ("в целях обеспечения выполнения реализации").
- Выявляйте канцелярские маркеры: "данный/данная/данное", "является" (более 1 раза на 500 слов), "имеет место быть", "в связи с тем, что".
- Выявляйте глагольный паралич: замену прямых глаголов отглагольными связками ("осуществить перезапуск" -> "перезапустить").
- Проверяйте пассивный залог и безличность, снижающие четкость инженерных инструкций.
- 100: чистый живой инженерный русский язык с активными глаголами. <60: тяжеловесный бюрократический канцелярит.

2. [КРИТЕРИЙ: NO AI SLOP / ШТАМПЫ И ШЕЛУХА ИИ] (0-100):
- Выявляйте риторическую расчистку горла (throat-clearing): "В современном мире...", "Давайте разберемся...", "Ни для кого не секрет...".
- Выявляйте бинарные контрасты (binary contrasts): "Дело не в сервере. Дело в памяти.", "Это не просто утилита, а целая парадигма".
- Выявляйте псевдо-инсайты и раскрытия через двоеточие: "Секрет кроется в одном:", "То, о чем все молчат:".
- Запрещенные маркерные слова-пустышки: "робастный", "инновационный", "экосистема", "парадигма", "погрузимся в", "комплексный подход", "играет ключевую роль", "трансформирующий", "краеугольный камень".
- Выявляйте фальшивые глубокомысленные финалы (fake-profound kickers): "Ведь в конечном счете, база знаний — это душа команды...".
- 100: полное отсутствие штампов нейросетей, сразу к делу. <60: перенасыщенность слопом и пафосом.

3. [КРИТЕРИЙ: KB ARTICLE / СТРУКТУРА РЕШЕНИЯ] (0-100):
- Обязательные метаданные: проверьте наличие в самом начале статьи (сразу под заголовком H1) блока метаданных со ссылкой на исходный тикет, датой создания, статусом «сгенерировано автоматически» и датой последней проверки. При отсутствии блока или любого из 4 обязательных полей снижайте оценку и фиксируйте дефект.
- Классифицируйте тип статьи: How-to, Troubleshooting, FAQ, Known Issue, Reference.
- Для Troubleshooting: обязательны секции Симптомы (текст ошибки/логов), Первопричина (Root Cause), Пошаговое решение (Solution), Проверка (Verification), Профилактика (Prevention).
- Для How-to: Предварительные требования (Prerequisites), Пошаговый алгоритм с ожидаемым результатом каждого шага, Проверка.
- Оцените находимость (Searchability): понятен ли заголовок инженеру/клиенту, приведены ли точные коды и тексты ошибок.
- 100: четкая архитектура статьи, шаги легко воспроизводимы. <60: хаотичный поток мыслей без структуры.

4. [КРИТЕРИЙ: ФОРМАТИРОВАНИЕ CALLOUT И КОДА] (0-100):
- Проверяйте использование нативных BookStack callouts:
  <div class="callout info"><p>...</p></div>
  <div class="callout warning"><p>...</p></div>
  <div class="callout danger"><p>...</p></div>
  <div class="callout success"><p>...</p></div>
  (или GitHub callouts > [!NOTE], > [!WARNING]).
- Оформление кода: все команды, конфиги и логи должны быть в fenced блоках с точным языком (bash, json, yaml, ini, nginx, sql, log).
- Плейсхолдеры (<IP>, <TOKEN>) должны быть четко отделены от исполняемого кода.
- Иерархия заголовков (H2 ##, H3 ### без скачков), оглавление и списки.
- 100: образцовая разметка BookStack с callouts и кодом. <60: голый текст без блоков кода и оформления.

[ПРЕДОХРАНИТЕЛЬ ФАКТ-ЗАМКА (FACT LOCK DETECTION)]:
Найдите и занесите в массив preservedTechnicalEntities ВСЕ выявленные в статье ссылки на тикеты, даты создания и проверки, IP-адреса, порты, пути файлов, имена процессов/служб, коды ошибок, версии и параметры конфигурации. Они должны быть строго защищены от изменений при последующем рерайтинге.`;

    const auditPrompt = `
<task_goal>
Провести всесторонний аудит статьи базы знаний BookStack, выявить дефекты с точными цитатами, рассчитать баллы и сформировать рекомендации.
</task_goal>

${targetCriteria && targetCriteria.length > 0 ? `<focus_criteria>\nФокусные критерии: ${targetCriteria.join(', ')}\n</focus_criteria>` : ''}

<article_content>
${markdown}
</article_content>

Сформируйте JSON-отчет аудита в строгом соответствии с предложенной схемой.`;

    const auditResult = await this.generateContent(
      apiKey,
      currentActiveModel,
      [{ role: 'user', parts: [{ text: auditPrompt }] }],
      {
        responseMimeType: 'application/json',
        responseSchema: {
          type: "object",
          properties: {
            overallScore: { type: "number" },
            criteriaScores: {
              type: "object",
              properties: {
                humanizerRu: { type: "number" },
                noAiSlop: { type: "number" },
                kbStructure: { type: "number" },
                formattingAndCallouts: { type: "number" }
              },
              required: ["humanizerRu", "noAiSlop", "kbStructure", "formattingAndCallouts"]
            },
            articleType: {
              type: "string",
              enum: ["how_to", "troubleshooting", "faq", "known_issue", "reference", "unstructured"]
            },
            verdict: {
              type: "string",
              enum: ["ready", "needs_minor_polish", "needs_major_rewrite"]
            },
            summary: { type: "string" },
            defects: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  criterion: {
                    type: "string",
                    enum: ["humanizer_ru", "no_ai_slop", "kb_structure", "formatting"]
                  },
                  severity: {
                    type: "string",
                    enum: ["critical", "warning", "info"]
                  },
                  originalExcerpt: { type: "string" },
                  issue: { type: "string" },
                  recommendation: { type: "string" }
                },
                required: ["id", "criterion", "severity", "originalExcerpt", "issue", "recommendation"]
              }
            },
            recommendations: {
              type: "array",
              items: { type: "string" }
            },
            preservedTechnicalEntities: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: [
            "overallScore",
            "criteriaScores",
            "articleType",
            "verdict",
            "summary",
            "defects",
            "recommendations",
            "preservedTechnicalEntities"
          ]
        },
        systemInstruction: sysInstruction
      }
    );

    currentActiveModel = auditResult.modelUsed;
    const parsed = extractJson(auditResult.text);

    // Нормализация и валидация оценок
    const humanizerRu = Math.min(100, Math.max(0, Number(parsed.criteriaScores?.humanizerRu ?? 70)));
    const noAiSlop = Math.min(100, Math.max(0, Number(parsed.criteriaScores?.noAiSlop ?? 70)));
    const kbStructure = Math.min(100, Math.max(0, Number(parsed.criteriaScores?.kbStructure ?? 70)));
    const formattingAndCallouts = Math.min(100, Math.max(0, Number(parsed.criteriaScores?.formattingAndCallouts ?? 70)));

    const weightedScore = Math.round(
      0.25 * humanizerRu +
      0.25 * noAiSlop +
      0.30 * kbStructure +
      0.20 * formattingAndCallouts
    );

    const overallScore = typeof parsed.overallScore === 'number' 
      ? Math.min(100, Math.max(0, Math.round(parsed.overallScore))) 
      : weightedScore;

    const verdict: 'ready' | 'needs_minor_polish' | 'needs_major_rewrite' = 
      overallScore >= 85 ? 'ready' : (overallScore >= 60 ? 'needs_minor_polish' : 'needs_major_rewrite');

    return {
      overallScore,
      criteriaScores: {
        humanizerRu,
        noAiSlop,
        kbStructure,
        formattingAndCallouts
      },
      articleType: parsed.articleType || 'unstructured',
      verdict,
      summary: parsed.summary || 'Аудит завершен.',
      defects: Array.isArray(parsed.defects) ? parsed.defects : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      preservedTechnicalEntities: Array.isArray(parsed.preservedTechnicalEntities) ? parsed.preservedTechnicalEntities : [],
      modelUsed: currentActiveModel
    };
  }

  public async refineArticle(
    apiKey: string,
    markdown: string,
    instructions: string = 'Проведите глубокую редакторскую чистку статьи и приведите её к стандартам базы знаний BookStack.',
    activeSkills: string[] = ['humanizer-ru', 'no-ai-slop', 'kb-article'],
    model: string = 'gemini-3.7-flash',
    availableContext?: { books: any[], chapters: any[] }
  ): Promise<ArticleRefineResult> {
    let currentActiveModel = model;

    const skillsDirectives: string[] = [];

    const isSkillActive = (skillId: string) => {
      if (!activeSkills || activeSkills.length === 0) return true;
      return activeSkills.some(s => s.toLowerCase().includes(skillId.toLowerCase()));
    };

    if (isSkillActive('humanizer-ru')) {
      skillsDirectives.push(`[НАВЫК: HUMANIZER-RU (РУССКИЙ РЕДАКТОР)]
- Принцип: «Удаляй, не дописывай». Запрещено добавлять выдуманные эмоции, байки или шутки.
- Преобразуйте канцелярит и отглагольный паралич в прямые глаголы («произвести запуск» -> «запустить», «в целях обеспечения» -> «чтобы»).
- Искорените слова-паразиты: «данный/данная/данное», «является» (заменяйте на тире или убирайте), «в связи с тем, что» («потому что»).
- Ликвидируйте нанизывание цепочек существительных в родительном падеже.
- Применяйте 5 редакторских действий: KEEP (сохраняйте факты), TRIM (срезайте воду), REPLACE (заменяйте штампы), JOIN (сливайте повторы), SPLIT (делите громоздкие предложения).`);
    }

    if (isSkillActive('no-ai-slop')) {
      skillsDirectives.push(`[НАВЫК: NO AI SLOP (АНТИ-ШТАМПЫ ИИ)]
- Сразу к технической сути: срезайте риторические преамбулы («В современном мире...», «Давайте разберемся...»).
- Искорените бинарные контрасты («Дело не в X, дело в Y», «Это не просто X, это Y»).
- Устраните позу гуру и драматические двоеточия («Секрет прост: ...», «То, о чем все молчат: ...»).
- Черный список запрещенных слов: delve, robust, cutting-edge, инновационный, комплексный подход, ключевую роль, трансформирующий, краеугольный камень, гобелен, маяк, смена парадигмы, меняет правила игры.
- Удалите морализаторские или глубокомысленные финалы («Ведь в конечном счете...»).`);
    }

    if (isSkillActive('kb-article')) {
      skillsDirectives.push(`[НАВЫК: KB ARTICLE (СТАНДАРТ БАЗЫ ЗНАНИЙ)]
- Приведите статью к четкому типу:
  * Troubleshooting: Симптомы (Symptoms с точным текстом лога/ошибки), Первопричина (Root Cause), Пошаговое решение (Solution с командами), Проверка (Verification - команда для проверки исправления), Профилактика (Prevention).
  * How-to: Предварительные требования (Prerequisites), Пошаговые действия (с активными глаголами), Проверка результата.
  * FAQ: Прямой и краткий ответ в первом абзаце (1-2 предложения), затем подробности.
  * Known Issue: Статус, затронутые версии, описание обходного пути (Workaround).
  * Reference: Четкие таблицы параметров, лимитов или кодов.
- Заголовок сформулируйте на языке поискового запроса инженера (Searchability).`);
    }

    if (isSkillActive('analyzing-logs') || isSkillActive('log-analyzer')) {
      skillsDirectives.push(`[НАВЫК: ANALYZING LOGS (АНАЛИЗ ЛОГОВ)]
- Выделяйте фрагменты логов в fenced блоки с синтаксисом \`\`\`log или \`\`\`json.
- Четко выделите ключевые строки с ошибками (ERROR, FATAL, Exception) и стектрейсы.
- Сохраняйте оригинальные таймстампы, имена потоков и коды ответов без сокращений.
- Привяжите каждую найденную аномалию в логе к конкретному шагу решения.`);
    }

    const contextStr = availableContext
      ? `\nДОСТУПНАЯ СТРУКТУРА WIKI:
         КНИГИ: ${JSON.stringify(availableContext.books?.map(b => ({ id: b.id, name: b.name })) || [])}
         ГЛАВЫ: ${JSON.stringify(availableContext.chapters?.map(c => ({ id: c.id, name: c.name, book_id: c.book_id })) || [])}\n`
      : '';

    const sysInstruction = `Вы — элитный технический редактор и Wiki-архитектор (Wiki Article Doctor) системы Bridge.LM для BookStack.
Ваша цель — отредактировать, структурировать и довести до совершенства переданную статью базы знаний.

[🔒 АБСОЛЮТНЫЙ ФАКТ-ЗАМОК (RIGID FACT LOCK)]:
Фактическая точность имеет наивысший приоритет над стилистикой:
1. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО изменять, искажать или подменять:
   - Любые IP-адреса (напр. 192.168.1.1, 10.0.0.5), порты (80, 443, 3000, 9200), FQDN, домены, URL.
   - Пути к файлам, директориям, логам и конфигурациям (/etc/..., /var/log/...).
   - Имена служб, процессов, systemd юнитов, демонов.
   - Сообщения об ошибках, стектрейсы, HTTP/SQL коды, сигналы ядра (OOM-Killer, SIGTERM).
   - Названия конфигурационных директив, флаги утилит, переменные окружения.
   - Номера версий пакетов и библиотек.
2. ЗАПРЕЩЕНО придумывать новые факты, метрики, цифры или воображаемые примеры ("например, на нашем проде...").
3. Если в оригинале предложение не содержит фактов и наполнено водой — УДАЛИТЕ его, не выдумывая подробностей.

[ДИРЕКТИВЫ АКТИВНЫХ НАВЫКОВ]:
${skillsDirectives.join('\n\n')}

[ОФОРМЛЕНИЕ ДЛЯ BOOKSTACK]:
1. Используйте нативные блоки вызова внимания (callouts):
   <div class="callout info"><p>Пояснение или справочная информация</p></div>
   <div class="callout warning"><p>Предостережение о нюансах или возможных проблемах</p></div>
   <div class="callout danger"><p>Критическая опасность потери данных или остановки сервиса</p></div>
   <div class="callout success"><p>Подтверждение успешности выполнения проверки</p></div>
2. Оформление кода: команды и конфиги обязательно помещайте в fenced блоки с указанием языка (\`\`\`bash, \`\`\`yaml, \`\`\`nginx, \`\`\`json, \`\`\`log, \`\`\`sql).
3. Иерархия заголовков: используйте H2 (##) и H3 (###). Не используйте H1 (#) внутри текста (он зарезервирован под заголовок страницы).
4. Запрещены технические мета-теги (target_book:, priority:) и YAML-фронтматтер внутри Markdown.`;

    const refinePrompt = `
<task_instructions>
${instructions}
</task_instructions>

${contextStr}

<original_article_markdown>
${markdown}
</original_article_markdown>

Выполните ревизию и рерайтинг статьи в соответствии с системной инструкцией, активными навыками и жестким [🔒 ФАКТ-ЗАМКОМ].
Верните результат в формате JSON.`;

    const refineResult = await this.generateContent(
      apiKey,
      currentActiveModel,
      [{ role: 'user', parts: [{ text: refinePrompt }] }],
      {
        responseMimeType: 'application/json',
        responseSchema: {
          type: "object",
          properties: {
            thinking: { type: "string" },
            title: { type: "string" },
            markdown: { type: "string" },
            tags: {
              type: "array",
              items: { type: "string" }
            },
            description: { type: "string" },
            changesSummary: {
              type: "array",
              items: { type: "string" }
            },
            factLockVerified: { type: "boolean" }
          },
          required: ["thinking", "title", "markdown", "tags", "description", "changesSummary", "factLockVerified"]
        },
        systemInstruction: sysInstruction
      }
    );

    currentActiveModel = refineResult.modelUsed;
    const parsed = extractJson(refineResult.text);

    const cleanMarkdown = stripTechnicalMetadata(parsed.markdown || markdown);
    const withMetadataMarkdown = ensureArticleMetadata(cleanMarkdown, {
      lastVerificationDate: getCurrentDateFormatted(),
      status: 'сгенерировано автоматически'
    });
    const withTocMarkdown = generateTableOfContents(withMetadataMarkdown);
    const finalMarkdown = convertCalloutsToBookStackHtml(withTocMarkdown);

    const finalTags = Array.isArray(parsed.tags) ? [...parsed.tags] : [];
    if (!finalTags.includes('сгенерировано автоматически')) {
      finalTags.push('сгенерировано автоматически');
    }

    return {
      thinking: parsed.thinking || 'Ревизия статьи завершена.',
      title: parsed.title || 'Отредактированная статья',
      markdown: finalMarkdown,
      tags: finalTags,
      description: parsed.description || '',
      changesSummary: Array.isArray(parsed.changesSummary) ? parsed.changesSummary : [],
      factLockVerified: parsed.factLockVerified !== false,
      modelUsed: currentActiveModel
    };
  }

  /**
   * Экспресс-оценка ценности тикета для базы знаний (Triage Check)
   */
  public async triageTicket(
    apiKey: string,
    ticketText: string,
    model: string = 'gemini-2.5-flash'
  ): Promise<{ isEligible: boolean; reason: string }> {
    const prompt = `Вы — ведущий инженер поддержки и архитектор базы знаний.
Оцените следующий текст закрытого тикета поддержки и определите, содержит ли он описание реальной проблемы/инцидента И подтвержденное решение или шаги устранения, которые имеют ценность для базы знаний Wiki компании.

Критерии отказа (isEligible: false):
- Тикет закрыт без решения (клиент не ответил, отменил заявку)
- Банальный диалог вежливости ("Спасибо", "Пожалуйста", "Как дела?")
- Спам или ошибочные обращения
- Тривиальные запросы без технической ценности (например, "где мой счет?", "выставите акт")
- Вопрос остался нерешенным

Критерии одобрения (isEligible: true):
- Описана техническая проблема, сбой, ошибка, вопрос по настройке или регламент
- Приведено конкретное решение, конфигурация, команда, обходной путь (workaround) или инструкция

Текст обращения:
---
${ticketText.substring(0, 10000)}
---

Ответьте строго в формате JSON:
{
  "isEligible": true/false,
  "reason": "краткое пояснение на русском языке (1 предложение)"
}`;

    try {
      const resp = await this.generateContent(
        apiKey,
        model,
        [{ role: 'user', parts: [{ text: prompt }] }],
        {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              isEligible: { type: 'boolean' },
              reason: { type: 'string' }
            },
            required: ['isEligible', 'reason']
          }
        }
      );
      return extractJson(resp.text);
    } catch (e: any) {
      console.warn('[GeminiService] Ошибка triageTicket, fallback к положительной оценке:', e.message);
      return { isEligible: true, reason: 'Оценка пропущена из-за сбоя API, генерация продолжена' };
    }
  }
}




