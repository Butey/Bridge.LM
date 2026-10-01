import { BookStackCredentials } from '../types';
import { callGemini, extractJson, GeminiModelId, DEFAULT_MODEL } from './gemini';
import { searchPages, searchVectorStore, fetchPage } from './api';

// Safe replacement helper to avoid JS string.replace regex-substitutions issues (like $&, $1, etc.)
function safeReplace(str: string, search: string, replacement: string): string {
  if (!str) return '';
  return str.split(search).join(replacement);
}

/**
 * Generates narrow search queries based on the user's goal and sources.
 */
async function generateSearchQueries(
  goal: string,
  sources: string,
  model: GeminiModelId,
  options?: { signal?: AbortSignal; checkPause?: () => Promise<void>; searchPrompt?: string }
): Promise<string[]> {
  const defaultQueryPrompt = `Основываясь на задаче: "{goal}" и содержании источников:
<untrusted_source_content>
{sources}
</untrusted_source_content>

ЦЕЛЬ: Сгенерировать ровно 5 высокоточных поисковых запросов для поискового движка BookStack Wiki (MySQL Full-Text Search в Boolean Mode).

КРИТИЧЕСКИЕ ПРАВИЛА ПОИСКОВОГО ДВИЖКА MYSQL:
1. ИГНОРИРОВАНИЕ МУСОРА: Категорически игнорируй номера тикетов и задач (напр., "225-390021", "тикет 1245", "Omnidesk"), имена клиентов и даты. Ищи только инженерную СУТЬ проблемы!
2. НЕТ РУССКОЙ МОРФОЛОГИИ: Все русские слова пиши СТРОГО в начальной форме (Именительный падеж, единственное число: "панель", "сброс", "пароль", а НЕ "панелей", "сбросить", "паролями").
3. ОГРАНИЧЕНИЕ ПО ДЛИНЕ: Длина запроса строго 1–3 слова! Длинные запросы (4–5 слов) возвращают 0 результатов.
4. МИНИМУМ 3 СИМВОЛА: Избегай одиночных слов короче 3 букв (UI, IP, OS). Объединяй их: "интерфейс ui", "ip адрес", "routeros".
5. НИКАКИХ ДЕФИСОВ: Знак минуса "-" в MySQL означает логическое NOT и ломает поиск. Пиши "app server", а НЕ "app-server"; "service 01", а НЕ "service-01".
6. ДВУЯЗЫЧИЕ И БРЕНДЫ: Учитывай транслитерацию ключевых названий (Docker / Докер, PostgreSQL / Постгрес, Redis / Редис).

СТРУКТУРА 5 ЗАПРОСОВ (ПО СЛОТАМ):
1. [Точный идентификатор]: Код ошибки, название модуля или артикул (напр., "ERR 1042", "routeros", "bolid").
2. [Дубль — RU (Лемма)]: Объект + действие строго в именительном падеже (напр., "панель сброс пароль", "сервер обновление лицензия").
3. [Дубль — EN / Транслит]: Тот же процесс на английском или с транслитерацией бренда (напр., "server password reset", "сервер авторизация токен").
4. [Контекст — Надсистема/Prerequisites]: Родительская платформа или среда настройки (напр., "cloud авторизация", "studio проект настройка").
5. [Контекст — Протокол/Архитектура]: Связующий компонент или шина (напр., "mqtt брокер", "knx шлюз").

ОГРАНИЧЕНИЯ:
❌ Запрещены слова-паразиты в одиночку: "инструкция", "настройка", "проблема", "ошибка", "сервер".
❌ Запрещены фразы длиннее 3 слов.

Верни СТРОГО JSON-массив из 5 строк без Markdown-разметки:
["запрос1", "запрос2", "запрос3", "запрос4", "запрос5"]`;

  let queryPrompt = options?.searchPrompt 
    ? options.searchPrompt
    : defaultQueryPrompt;

  const cleanGoal = goal.replace(/тикет\s*[\d-]+/gi, '').replace(/ticket\s*[\d-]+/gi, '').replace(/\b\d{3}-\d{6}\b/g, '');
  queryPrompt = safeReplace(queryPrompt, '{goal}', cleanGoal);
  queryPrompt = safeReplace(queryPrompt, '{sources}', sources.substring(0, 1500));

  let queries: string[] = [];
  try {
    const qResp = await callGemini(model, [{ role: 'user', parts: [{ text: queryPrompt }] }], {
      responseMimeType: 'application/json',
      responseSchema: {
        type: "array",
        items: { type: "string" }
      },
      signal: options?.signal, 
      checkPause: options?.checkPause 
    });
    const parsed = extractJson(qResp.text);
    if (Array.isArray(parsed)) {
      queries = parsed.filter(item => typeof item === 'string');
    } else if (typeof parsed === 'string') {
      queries = [parsed];
    } else {
      throw new Error("Invalid json format for queries");
    }
  } catch (e: any) {
    if (e.message && (e.message.includes('QUOTA_EXCEEDED') || e.message.includes('429') || e.message.includes('Сетевая ошибка'))) {
      throw e;
    }
    console.error('[Agent] Query generation failed. Falling back to key terms.', e);
    const rawWords = cleanGoal.replace(/[^\w\а-яА-ЯёЁ\s]/g, '').split(/\s+/).filter(w => w.length > 3 && !/^\d+$/.test(w));
    queries = rawWords.slice(0, 2);
  }

  // Ensure fallback words from goal
  const fallbackTerms = cleanGoal.replace(/[^\w\а-яА-ЯёЁ\s]/g, '').split(/\s+/).filter(w => w.length > 4 && !/^\d+$/.test(w));
  if (fallbackTerms.length > 0) {
    queries.push(fallbackTerms[0]);
  }

  return [...new Set(queries.map(q => q.trim()).filter(q => q.length > 2))];
}

/**
 * Searches for relevant documents via vector indexing and standard keywords.
 */
async function searchRelevantPages(
  queries: string[],
  goal: string,
  credentials: BookStackCredentials,
  options?: { signal?: AbortSignal; checkPause?: () => Promise<void> }
): Promise<{ retrievedPages: any[]; fetchedIds: Set<number> }> {
  const retrievedPages: any[] = [];
  const fetchedIds = new Set<number>();

  // 1. Vector store search
  const cleanGoal = goal.replace(/тикет\s*[\d-]+/gi, '').replace(/ticket\s*[\d-]+/gi, '').replace(/\b\d{3}-\d{6}\b/g, '');
  try {
    const vectorResults = await searchVectorStore(cleanGoal, 3);
    for (const vRes of vectorResults) {
      if (vRes.id && vRes.id.startsWith('bookstack:page:')) {
        const pageId = parseInt(vRes.id.replace('bookstack:page:', ''), 10);
        if (!isNaN(pageId) && !fetchedIds.has(pageId)) {
          fetchedIds.add(pageId);
          retrievedPages.push({
            id: pageId,
            name: vRes.metadata?.name || 'Найденная через векторный поиск статья',
            snippet: vRes.text.substring(0, 4000),
            book_id: vRes.metadata?.book_id,
            url: vRes.metadata?.url
          });
        }
      }
    }
  } catch (e) {
    console.error('[Agent] Vector store search failed:', e);
  }

  // 2. Keyword Search in Parallel across up to 5 queries
  try {
    const searchPromises = queries.slice(0, 5).map(async (q) => {
      if (options?.checkPause) await options.checkPause();
      try {
        const sanitizedQ = q.replace(/[-_–—]/g, ' ').replace(/[^\w\d\sа-яА-ЯёЁ]/gi, '').trim();
        const results = await searchPages(credentials, `${sanitizedQ || q} {type:page}`);
        return Array.isArray(results) ? results : (results?.data || []);
      } catch (e) {
        console.error(`[Agent] Search error for query "${q}":`, e);
        return [];
      }
    });

    const searchResultsLists = await Promise.all(searchPromises);
    const itemsToFetch: any[] = [];

    for (const results of searchResultsLists) {
      for (const res of results.slice(0, 5)) {
        const pageId = typeof res.id === 'string' ? parseInt(res.id, 10) : res.id;
        if (!isNaN(pageId) && !fetchedIds.has(pageId) && res.type === 'page') {
          fetchedIds.add(pageId);
          itemsToFetch.push({ ...res, id: pageId });
        }
      }
    }

    // 3. Parallel full content fetching for optimal context analysis
    if (itemsToFetch.length > 0) {
      // Process in batches to avoid rate limits and freezing
      const batchSize = 5;
      const resolvedPages = [];
      for (let i = 0; i < itemsToFetch.length; i += batchSize) {
        const batch = itemsToFetch.slice(i, i + batchSize);
        const batchPromises = batch.map(async (res) => {
          if (options?.checkPause) await options.checkPause();
          let fullSnippet = '';
          try {
            const fullPage = await fetchPage(credentials, res.id);
            const text = fullPage.markdown || fullPage.html || fullPage.raw_html || '';
            fullSnippet = text.substring(0, 4000); // 4000 chars should be enough to decide if it's a duplicate
          } catch (err) {
            console.error(`[Agent] Failed to fetch page content for page ID ${res.id}`, err);
            const snippetObj = res.preview_html || res.preview_text;
            fullSnippet = (typeof snippetObj === 'object' && snippetObj !== null)
              ? (snippetObj.content || snippetObj.text || JSON.stringify(snippetObj))
              : (snippetObj || '');
          }
          return { id: res.id, name: res.name, snippet: fullSnippet, book_id: res.book_id, url: res.url };
        });
        const batchResults = await Promise.all(batchPromises);
        resolvedPages.push(...batchResults);
      }

      retrievedPages.push(...resolvedPages);
    }
  } catch (searchErr) {
    console.error('[Agent] Parallel keyword search or fetching failed', searchErr);
  }

  return { retrievedPages, fetchedIds };
}

export async function agenticRagWorkflow(
  sources: string,
  goal: string,
  credentials: BookStackCredentials,
  model: GeminiModelId = DEFAULT_MODEL,
  onProgress?: (msg: string) => void,
  options?: { signal?: AbortSignal, checkPause?: () => Promise<void>, searchPrompt?: string, duplicatePrompt?: string, contextPrompt?: string }
) {
  onProgress?.('Агент запускает RAG-флоу: генерация поисковых запросов...');
  
  // Step 1: Query generation
  const queries = await generateSearchQueries(goal, sources, model, {
    signal: options?.signal,
    checkPause: options?.checkPause,
    searchPrompt: options?.searchPrompt
  });

  onProgress?.(`Агент осуществляет семантический и ключевой поиск в BookStack по запросам: ${queries.join(', ')}...`);
  
  // Step 2: Parallel search & fetching
  const { retrievedPages } = await searchRelevantPages(queries, goal, credentials, {
    signal: options?.signal,
    checkPause: options?.checkPause
  });

  if (retrievedPages.length === 0) {
    onProgress?.('Релевантные статьи не найдены. Агент рекомендует: СОЗДАТЬ');
    return { decision: 'create', retrievedContext: [], relatedPages: [] };
  }

  onProgress?.('Агент проверяет найденные статьи на предмет точных дублей...');
  
  // Step 3: Duplicate detection
  const defaultDuplicatePrompt = `Вы — Senior системный аналитик базы знаний BookStack.
Цель пользователя: "{goal}".
Новый материал: 
<untrusted_source_content>
{sources}
</untrusted_source_content>

Найденные статьи в Wiki:
<candidate_wiki_pages>
{retrievedPages}
</candidate_wiki_pages>

ЦЕЛЬ: Определить, есть ли среди найденных статей существующий документ, который описывает ЭТУ ЖЕ процедуру и подлежит ОБНОВЛЕНИЮ вместо создания новой страницы.

КЛАССИФИКАЦИЯ СОВПАДЕНИЯ (поле matchType):
- "EXACT_DUPLICATE": Статья описывает ТОТ ЖЕ объект + ТО ЖЕ действие + В ТОЙ ЖЕ системе и версии (требуется полное обновление существующей статьи!).
- "VERSION_VARIANT": Та же задача, но описана для другой версии ОС, прошивки или платформы (требуется создать отдельную статью, НЕ перезаписывать!).
- "PARTIAL_OVERLAP": Описывает более широкий процесс, частью которого является новая инструкция (НЕ является дублем).
- "NO_DUPLICATE": Разные задачи или разные ошибки.

СТЕПЕНЬ УВЕРЕННОСТИ (confidence):
- "high": Полная уверенность на основе совпадения параметров, симптомов и архитектуры.
- "medium": Есть сходство названий, но не совпадают версии или контекст.
- "low": Поверхностное совпадение терминов.

ПРАВИЛО ПРИНЯТИЯ РЕШЕНИЯ:
isDuplicate = true выставляется ТОЛЬКО если:
matchType === "EXACT_DUPLICATE" И confidence === "high".
Во всех остальных случаях isDuplicate = false!

Верни СТРОГО валидный JSON:
{
  "evaluatedPages": [
    {
      "id": number,
      "matchType": "EXACT_DUPLICATE" | "VERSION_VARIANT" | "PARTIAL_OVERLAP" | "NO_DUPLICATE",
      "confidence": "high" | "medium" | "low",
      "reason": "краткое сопоставление объекта, действия и платформы на русском языке",
      "isDuplicate": boolean
    }
  ]
}`;

  let duplicatePromptStr = options?.duplicatePrompt || defaultDuplicatePrompt;
  duplicatePromptStr = safeReplace(duplicatePromptStr, '{goal}', goal);
  duplicatePromptStr = safeReplace(duplicatePromptStr, '{sources}', sources.substring(0, 2000));
  const duplicateMinifiedPages = retrievedPages.map(p => ({ id: p.id, name: p.name, snippet: p.snippet.substring(0, 1500) }));
  duplicatePromptStr = safeReplace(duplicatePromptStr, '{retrievedPages}', JSON.stringify(duplicateMinifiedPages));

  let duplicateIds: number[] = [];
  try {
    const dupResp = await callGemini(model, [{ role: 'user', parts: [{ text: duplicatePromptStr }] }], {
      responseMimeType: 'application/json',
      responseSchema: {
        type: "object",
        properties: {
          evaluatedPages: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "number" },
                reason: { type: "string" },
                isDuplicate: { type: "boolean" }
              },
              required: ["id", "reason", "isDuplicate"]
            }
          }
        },
        required: ["evaluatedPages"]
      },
      signal: options?.signal, 
      checkPause: options?.checkPause 
    });
    const dupJson = extractJson(dupResp.text);
    duplicateIds = (dupJson.evaluatedPages || []).filter((p: any) => p.isDuplicate).map((p: any) => p.id);
  } catch(e: any) {
    if (e.message && (e.message.includes('QUOTA_EXCEEDED') || e.message.includes('429') || e.message.includes('Сетевая ошибка'))) {
      throw e;
    }
    console.error('[Agent] Duplicate detection failed', e);
  }

  const duplicatePages = retrievedPages.filter(p => duplicateIds.includes(p.id));
  const remainingPages = retrievedPages.filter(p => !duplicateIds.includes(p.id));
  
  onProgress?.('Агент классифицирует оставшиеся статьи как вспомогательный контекст...');
  
  // Step 4: Context classification
  const defaultContextPrompt = `Вы — ведущий архитектор базы знаний BookStack и эксперт по семантической фильтрации.
Цель пользователя: "{goal}".
Новый материал:
<untrusted_source_content>
{sources}
</untrusted_source_content>

Найденные статьи в Wiki:
<candidate_wiki_pages>
{retrievedPages}
</candidate_wiki_pages>

ЦЕЛЬ: Провести строгую селекцию найденных статей. Отобрать ТОЛЬКО те, которые содержат реальные технические зависимости, предварительные требования (prerequisites) или архитектурную базу для создаваемой статьи.

РУБРИКАЦИЯ КОНТЕКСТА (поле contextType):
- "prerequisite": Инструкция, которую пользователь ОБЯЗАН выполнить ДО начала текущей настройки (напр., создание шлюза, выпуск сертификата).
- "architecture": Описание топологии, используемых портов, протоколов или схема взаимодействия узлов.
- "configuration_example": Пример настройки смежного модуля, на который необходимо сослаться.
- "troubleshooting_ref": Справочник смежных кодов ошибок или таблица аппаратных неисправностей.
- "none": Статья НЕ содержит полезного технического контекста.

ПРАВИЛА ОТСЕЧЕНИЯ НЕПОДХОДЯЩЕГО МАТЕРИАЛА:
❌ Статья относится к другой платформе или несовместимой версии (напр., v1 legacy вместо v2 pro).
❌ Статья совпала лишь по общим словам ("сеть", "порт", "клиент"), но решает принципиально иной бизнес-процесс.
❌ При любых сомнениях устанавливай contextType: "none" и isContext: false.

ШКАЛА РЕЛЕВАНТНОСТИ (relevanceScore от 1 до 5):
5 — Критически важный prerequisite или базовая архитектура (без нее статью не понять).
4 — Полезный смежный контекст (рекомендуется сослаться в тексте).
1–3 — Слабая связь, фоновый шум или совпадение по общим терминам (ОТСЕКАТЬ!).

Флаг isContext устанавливается в true СТРОГО при relevanceScore >= 4 и contextType != "none".

Верни СТРОГО валидный JSON:
{
  "evaluatedPages": [
    {
      "id": number,
      "contextType": "prerequisite" | "architecture" | "configuration_example" | "troubleshooting_ref" | "none",
      "relevanceScore": number,
      "keyTakeaway": "ровно одно предложение: какой конкретный параметр, порт или факт из этой статьи нужно использовать",
      "reason": "краткое техническое обоснование связи на русском языке",
      "isContext": boolean
    }
  ]
}`;

  let contextPromptStr = options?.contextPrompt || defaultContextPrompt;
  contextPromptStr = safeReplace(contextPromptStr, '{goal}', goal);
  contextPromptStr = safeReplace(contextPromptStr, '{sources}', sources.substring(0, 2000));
  const contextMinifiedPages = remainingPages.map(p => ({ id: p.id, name: p.name, snippet: p.snippet.substring(0, 1000) }));
  contextPromptStr = safeReplace(contextPromptStr, '{retrievedPages}', JSON.stringify(contextMinifiedPages));

  let contextIds: number[] = [];
  try {
    if (remainingPages.length > 0) {
      const ctxResp = await callGemini(model, [{ role: 'user', parts: [{ text: contextPromptStr }] }], {
        responseMimeType: 'application/json',
        responseSchema: {
          type: "object",
          properties: {
            evaluatedPages: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "number" },
                  reason: { type: "string" },
                  isContext: { type: "boolean" }
                },
                required: ["id", "reason", "isContext"]
              }
            }
          },
          required: ["evaluatedPages"]
        },
        signal: options?.signal, 
        checkPause: options?.checkPause
      });
      const ctxJson = extractJson(ctxResp.text);
      contextIds = (ctxJson.evaluatedPages || []).filter((p: any) => p.isContext).map((p: any) => p.id);
    }
  } catch(e: any) {
    if (e.message && (e.message.includes('QUOTA_EXCEEDED') || e.message.includes('429') || e.message.includes('Сетевая ошибка'))) {
      throw e;
    }
    console.error('[Agent] Context detection failed', e);
    contextIds = remainingPages.map(p => p.id);
  }

  const contextPages = remainingPages.filter(p => contextIds.includes(p.id));
  
  if (duplicatePages.length === 0) {
    onProgress?.(`Дублей не найдено. Агент рекомендует: СОЗДАТЬ новую. Найдено ${contextPages.length} статей для контекста.`);
    return { decision: 'create', retrievedContext: contextPages, relatedPages: retrievedPages };
  }

  const decisionMsg = duplicatePages.length > 1 
    ? `Агент принял решение: обнаружены дублирующиеся статьи. Требуется ОБНОВЛЕНИЕ статьи "${duplicatePages[0].name}" (с объединением информации)`
    : `Агент принял решение: требуется ОБНОВЛЕНИЕ старой статьи "${duplicatePages[0].name}"`;

  onProgress?.(decisionMsg);
  
  const combinedContextPages = [...duplicatePages, ...contextPages];
  const uniqueContextPages = Array.from(new Map(combinedContextPages.map(item => [item.id, item])).values());

  return { 
    decision: 'update', 
    targetPageId: duplicatePages[0].id, 
    targetPageName: duplicatePages[0].name,
    targetBookId: duplicatePages[0].book_id,
    retrievedContext: uniqueContextPages,
    relatedPages: duplicatePages // Show true duplicates in the modal, not all random context pages
  };
}
