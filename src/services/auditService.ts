/**
 * Сервис аудита и редактирования статей базы знаний BookStack
 * Bridge.LM Knowledge Base Automation Engine
 */

import {
  BookStackCredentials,
  BookStackPage,
  ArticleAuditReport,
  AuditSessionState,
  AuditDiffSummary,
  AuditDiffLine,
  BookStackPageSnapshot,
  SafeUpdatePageOptions,
  AuditIssue,
  AuditMetric,
  AuditSuggestion
} from '../types';
import { bookstackProxy, invalidateCache } from './api';
import { callGemini, extractJson, GeminiModelId, DEFAULT_MODEL } from './gemini';

// ============================================================================
// 1. ВЗАИМОДЕЙСТВИЕ С BOOKSTACK API ЧЕРЕЗ PROXY
// ============================================================================

/**
 * Быстрый поиск страниц в BookStack по названию и содержимому
 * Использует нативный синтаксис поискового движка BookStack [type:page]
 * 
 * @param credentials Учетные данные BookStack
 * @param query Поисковая фраза (по заголовку, тегам или тексту)
 * @param options Дополнительные параметры (лимит, страница, фильтр типа)
 */
export async function searchBookStackPages(
  credentials: BookStackCredentials,
  query: string,
  options?: {
    count?: number;
    page?: number;
    filterType?: 'page' | 'all';
  }
): Promise<BookStackPage[]> {
  const count = options?.count || 10;
  const page = options?.page || 1;
  const isPageOnly = options?.filterType !== 'all';
  
  // Добавляем фильтр [type:page], если не указан иной
  const trimmedQuery = query.trim();
  const fullQuery = isPageOnly && !trimmedQuery.includes('[type:') 
    ? `${trimmedQuery} [type:page]` 
    : trimmedQuery;

  const url = `/api/search?query=${encodeURIComponent(fullQuery)}&count=${count}&page=${page}`;
  
  const response = await bookstackProxy(credentials, 'GET', url);
  const items = response?.data || [];

  return items.map((item: any) => ({
    id: item.id,
    name: item.name || 'Без названия',
    book_id: item.book_id,
    chapter_id: item.chapter_id || null,
    markdown: item.markdown || '',
    html: item.html || item.preview_html?.content || '',
    slug: item.slug || '',
    url: item.url || `${credentials.baseUrl.replace(/\/$/, '')}/books/page/${item.id}`,
    tags: item.tags || []
  }));
}

/**
 * Получение полной информации о странице BookStack (GET /api/pages/{id})
 * Извлекает Markdown, HTML, теги и метаданные ревизий
 * 
 * @param credentials Учетные данные BookStack
 * @param pageId ID страницы
 */
export async function fetchPageForAudit(
  credentials: BookStackCredentials,
  pageId: number
): Promise<BookStackPage> {
  const data = await bookstackProxy(credentials, 'GET', `/api/pages/${pageId}`);
  if (!data || !data.id) {
    throw new Error(`Страница с ID ${pageId} не найдена в BookStack.`);
  }

  // Нормализация контента: если страница была создана в WYSIWYG,
  // markdown может быть пустым, но html будет заполнен
  let markdownContent = data.markdown || '';
  if (!markdownContent && data.raw_html) {
    markdownContent = data.raw_html;
  } else if (!markdownContent && data.html) {
    markdownContent = data.html;
  }

  return {
    id: data.id,
    name: data.name || '',
    book_id: data.book_id,
    chapter_id: data.chapter_id || null,
    markdown: markdownContent,
    html: data.html || '',
    raw_html: data.raw_html || '',
    slug: data.slug || '',
    priority: data.priority || 0,
    revision_count: data.revision_count || 1,
    created_at: data.created_at || '',
    updated_at: data.updated_at || '',
    url: data.url || `${credentials.baseUrl.replace(/\/$/, '')}/books/page/${data.id}`,
    editor: data.editor || (data.markdown ? 'markdown' : 'wysiwyg'),
    tags: data.tags || []
  };
}

/**
 * Создание неизменяемого снимка (Snapshot) страницы для безопасного отката
 * 
 * @param page Объект страницы
 * @param reason Причина снимка
 */
export function createPageSnapshot(
  page: BookStackPage,
  reason: string = 'Снимок перед аудитом/редактированием'
): BookStackPageSnapshot {
  return {
    pageId: page.id,
    bookId: page.book_id,
    chapterId: page.chapter_id || null,
    name: page.name,
    markdown: page.markdown,
    html: page.html,
    tags: page.tags ? [...page.tags] : [],
    revisionNumber: page.revision_count,
    savedAt: new Date().toISOString(),
    summary: reason
  };
}

/**
 * Безопасное обновление страницы BookStack с фиксацией ревизии и снимком отката
 * Выполняет PUT /api/pages/{id} с передачей summary (комментария к ревизии)
 * 
 * @param credentials Учетные данные BookStack
 * @param pageId ID целевой страницы
 * @param options Параметры обновления
 */
export async function savePageRevision(
  credentials: BookStackCredentials,
  pageId: number,
  options: SafeUpdatePageOptions
): Promise<{ page: BookStackPage; snapshot: BookStackPageSnapshot }> {
  // 1. Получаем текущее состояние страницы для создания снимка отката
  const currentPage = await fetchPageForAudit(credentials, pageId);
  const snapshot = createPageSnapshot(
    currentPage,
    `Автоматический бэкап перед обновлением: ${options.summary || 'Редактирование статьи'}`
  );

  // 2. Формируем тело запроса PUT
  const payload: any = {
    name: options.name !== undefined ? options.name : currentPage.name,
    summary: options.summary || '[Bridge.LM Audit] Отредактировано ИИ с проверкой стандартов'
  };

  if (options.markdown !== undefined) {
    payload.markdown = options.markdown;
  } else if (options.html !== undefined) {
    payload.html = options.html;
  } else {
    payload.markdown = currentPage.markdown;
  }

  // Обработка тегов
  if (options.tags) {
    if (Array.isArray(options.tags) && options.tags.length > 0 && typeof options.tags[0] === 'string') {
      payload.tags = (options.tags as string[]).map(tag => ({ name: 'Category', value: tag }));
    } else {
      payload.tags = options.tags;
    }
  } else if (currentPage.tags) {
    payload.tags = currentPage.tags;
  }

  if (options.description) {
    payload.description = options.description;
  }

  if (options.book_id) {
    payload.book_id = options.book_id;
  }
  if (options.chapter_id !== undefined) {
    payload.chapter_id = options.chapter_id;
  }

  // 3. Отправляем запрос через прокси
  const updateResult = await bookstackProxy(credentials, 'PUT', `/api/pages/${pageId}`, payload);

  // 4. Инвалидируем кэш GET-запросов
  invalidateCache(credentials.baseUrl);

  // 5. Формируем актуальный объект страницы
  const updatedPage: BookStackPage = {
    id: updateResult.id || pageId,
    name: updateResult.name || payload.name,
    book_id: updateResult.book_id || currentPage.book_id,
    chapter_id: updateResult.chapter_id !== undefined ? updateResult.chapter_id : currentPage.chapter_id,
    markdown: updateResult.markdown || payload.markdown || '',
    html: updateResult.html || currentPage.html || '',
    slug: updateResult.slug || currentPage.slug,
    revision_count: updateResult.revision_count || (currentPage.revision_count ? currentPage.revision_count + 1 : 2),
    tags: updateResult.tags || payload.tags || [],
    url: updateResult.url || currentPage.url
  };

  return { page: updatedPage, snapshot };
}

/**
 * Мгновенный откат (Rollback) страницы BookStack к сохраненному снимку
 * BookStack REST API не предоставляет публичного эндпоинта для отката ревизий,
 * поэтому откат выполняется через повторный PUT содержимого снимка с фиксацией в истории.
 * 
 * @param credentials Учетные данные BookStack
 * @param snapshot Снимок предыдущего состояния
 * @param rollbackReason Причина отката
 */
export async function rollbackPage(
  credentials: BookStackCredentials,
  snapshot: BookStackPageSnapshot,
  rollbackReason: string = 'Откат изменений оператором'
): Promise<BookStackPage> {
  const summary = `[Bridge.LM Rollback] Откат к версии от ${new Date(snapshot.savedAt).toLocaleString('ru-RU')}: ${rollbackReason}`;

  const payload: any = {
    name: snapshot.name,
    summary,
    tags: snapshot.tags || []
  };

  if (snapshot.markdown) {
    payload.markdown = snapshot.markdown;
  } else if (snapshot.html) {
    payload.html = snapshot.html;
  }

  if (snapshot.chapterId !== undefined) {
    payload.chapter_id = snapshot.chapterId;
  }

  const result = await bookstackProxy(credentials, 'PUT', `/api/pages/${snapshot.pageId}`, payload);
  invalidateCache(credentials.baseUrl);

  return {
    id: result.id || snapshot.pageId,
    name: result.name || snapshot.name,
    book_id: result.book_id || snapshot.bookId,
    chapter_id: result.chapter_id !== undefined ? result.chapter_id : snapshot.chapterId,
    markdown: result.markdown || snapshot.markdown,
    html: result.html || snapshot.html,
    tags: result.tags || snapshot.tags || [],
    revision_count: result.revision_count,
    url: result.url
  };
}

// ============================================================================
// 2. ИИ-АУДИТ СТАТЬИ И ГЕНЕРАЦИЯ РЕВИЗИИ (GEMINI)
// ============================================================================

const AUDIT_SYSTEM_PROMPT = `Ты — ведущий инженер по обеспечению качества базы знаний (Knowledge Base Quality Auditor & Technical Editor) в корпоративной Wiki-системе BookStack.
Твоя цель: провести глубокий, всесторонний и объективный аудит предоставленной технической статьи или инструкции.

Критерии аудита (0-100 баллов каждый):
1. "Структура и логика" — наличие симптомов, причин, четких пошаговых действий, проверки результата и воркараундов при сбоях.
2. "Ясность и стиль" — соблюдение инфостиля (humanizer-ru), исключение канцелярита, штампов, стоп-слов, пассивного залога и вводных "воды".
3. "Техническая полнота" — конкретика (порты, команды, пути к файлам, коды ошибок, конфигурации вместо абстрактных фраз).
4. "Форматирование BookStack" — эффективное применение Markdown (callout-блоки > [!NOTE], > [!WARNING], > [!TIP], таблицы, подсветка синтаксиса в коде).
5. "Безопасность и актуальность" — отсутствие боевых паролей, токенов, закрытых ключей, проверка на устаревшие методы.

ФОРМАТ ОТВЕТА — СТРОГИЙ JSON БЕЗ ЛИШНЕГО ТЕКСТА:
{
  "overallScore": number, // 0-100 общий взвешенный балл
  "verdict": "excellent" | "good" | "needs_improvement" | "critical_rework",
  "summary": "Краткое резюме сильных и слабых сторон статьи на русском языке (2-3 предложения)",
  "improvedTitle": "Оптимизированный заголовок статьи (если оригинальный неточный или размытый)",
  "estimatedReadTimeMinutes": number,
  "metrics": [
    { "name": "Структура и логика", "score": number, "status": "good" | "warning" | "critical", "description": "краткое пояснение" },
    { "name": "Ясность и стиль", "score": number, "status": "good" | "warning" | "critical", "description": "краткое пояснение" },
    { "name": "Техническая полнота", "score": number, "status": "good" | "warning" | "critical", "description": "краткое пояснение" },
    { "name": "Форматирование BookStack", "score": number, "status": "good" | "warning" | "critical", "description": "краткое пояснение" },
    { "name": "Безопасность и актуальность", "score": number, "status": "good" | "warning" | "critical", "description": "краткое пояснение" }
  ],
  "issues": [
    {
      "id": "iss-1",
      "category": "clarity" | "accuracy" | "formatting" | "completeness" | "security",
      "severity": "critical" | "warning" | "info",
      "title": "Краткое название дефекта",
      "originalSnippet": "Точная цитата из текста, где допущена ошибка",
      "suggestedFix": "Конкретный исправленный вариант текста или команды",
      "explanation": "Почему это проблема и как исправление улучшает статью",
      "location": "Раздел или примерная строка"
    }
  ],
  "suggestions": [
    {
      "id": "sug-1",
      "type": "addition" | "refactor" | "formatting" | "seo",
      "title": "Рекомендация по улучшению",
      "recommendation": "Развернутое описание шага модернизации",
      "impact": "high" | "medium" | "low"
    }
  ]
}`;

/**
 * Проведение ИИ-аудита статьи с получением метрик качества, списка проблем и рекомендаций
 * 
 * @param content Исходный Markdown статьи
 * @param title Заголовок статьи
 * @param model Модель Gemini
 * @param signal Сигнал отмены запроса
 */
export async function auditArticle(
  content: string,
  title: string = 'Без заголовка',
  model: GeminiModelId = DEFAULT_MODEL,
  signal?: AbortSignal
): Promise<ArticleAuditReport> {
  if (!content || content.trim().length === 0) {
    throw new Error('Невозможно провести аудит: передан пустой текст статьи.');
  }

  const userPrompt = `Проведи детальный аудит следующей статьи базы знаний:

# Заголовок: ${title}

---
${content}
---`;

  const response = await callGemini(
    model,
    [{ role: 'user', parts: [{ text: userPrompt }] }],
    {
      systemInstruction: AUDIT_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      signal
    }
  );

  const rawJson = extractJson(response.text);

  // Нормализация и безопасные значения по умолчанию
  const overallScore = typeof rawJson.overallScore === 'number' 
    ? Math.max(0, Math.min(100, rawJson.overallScore)) 
    : 70;

  let verdict: 'excellent' | 'good' | 'needs_improvement' | 'critical_rework' = 'good';
  if (overallScore >= 85) verdict = 'excellent';
  else if (overallScore >= 70) verdict = 'good';
  else if (overallScore >= 50) verdict = 'needs_improvement';
  else verdict = 'critical_rework';

  const metrics: AuditMetric[] = Array.isArray(rawJson.metrics) && rawJson.metrics.length > 0
    ? rawJson.metrics.map((m: any) => ({
        name: String(m.name || 'Метрика'),
        score: typeof m.score === 'number' ? m.score : 70,
        status: (m.status === 'critical' || m.status === 'warning' || m.status === 'good') ? m.status : (m.score < 50 ? 'critical' : m.score < 75 ? 'warning' : 'good'),
        description: String(m.description || '')
      }))
    : [
        { name: 'Структура и логика', score: overallScore, status: 'good', description: 'Базовая проверка структуры' },
        { name: 'Ясность и стиль', score: overallScore, status: 'good', description: 'Базовая проверка стиля' },
        { name: 'Техническая полнота', score: overallScore, status: 'good', description: 'Базовая проверка полноты' },
        { name: 'Форматирование BookStack', score: overallScore, status: 'good', description: 'Базовая проверка Markdown' }
      ];

  const issues: AuditIssue[] = Array.isArray(rawJson.issues)
    ? rawJson.issues.map((iss: any, idx: number) => ({
        id: iss.id || `iss-${idx + 1}`,
        category: iss.category || 'clarity',
        severity: iss.severity || 'warning',
        title: iss.title || 'Замечание по тексту',
        originalSnippet: iss.originalSnippet || '',
        suggestedFix: iss.suggestedFix || iss.suggestion || '',
        suggestion: iss.suggestedFix || iss.suggestion || '',
        explanation: iss.explanation || iss.description || '',
        location: iss.location || ''
      }))
    : [];

  const suggestions: AuditSuggestion[] = Array.isArray(rawJson.suggestions)
    ? rawJson.suggestions.map((sug: any, idx: number) => ({
        id: sug.id || `sug-${idx + 1}`,
        type: sug.type || 'refactor',
        title: sug.title || 'Рекомендация',
        recommendation: sug.recommendation || '',
        impact: sug.impact || 'medium'
      }))
    : [];

  return {
    overallScore,
    verdict: rawJson.verdict || verdict,
    summary: rawJson.summary || 'Аудит статьи завершен.',
    improvedTitle: rawJson.improvedTitle || title,
    estimatedReadTimeMinutes: rawJson.estimatedReadTimeMinutes || Math.max(1, Math.round(content.split(/\s+/).length / 180)),
    metrics,
    issues,
    suggestions,
    auditedAt: new Date().toISOString(),
    modelUsed: response.modelUsed
  };
}

const REFINE_SYSTEM_PROMPT = `Ты — профессиональный технический редактор документации BookStack.
Твоя задача: переписать и улучшить статью базы знаний на основе отчета аудита и замечаний.

Ключевые правила:
1. ИСПРАВЛЕНИЕ ДЕФЕКТОВ: Устрани все замечания, выявленные в ходе аудита (водянистые формулировки, канцелярит, размытые инструкции).
2. СОХРАНЕНИЕ ФАКТОВ: Ни в коем случае не придумывай вымышленные команды, IP-адреса, ключи или параметры. Сохраняй все реальные факты из исходника.
3. СТАНДАРТЫ ОФОРМЛЕНИЯ BOOKSTACK:
   - Используй информативные блоки-выноски:
     > [!NOTE] Для важной справочной информации
     > [!WARNING] Для предупреждений об опасностях и рисках сбоя
     > [!TIP] Для полезных советов и оптимизаций
   - Все консольные команды оформляй в блоки кода с указанием языка (bash, sql, json и т.д.).
   - Приводи диагностические таблицы: "Код ошибки / Симптом | Причина | Способ решения".
4. СТИЛЬ: Четкий, лаконичный, ориентированный на быстрое решение задачи инженером или оператором.

ВЕРНИ ТОЛЬКО ИТОГОВЫЙ ТЕКСТ СТАТЬИ В MARKDOWN БЕЗ ВВОДНЫХ СЛОВ И ПОЯСНЕНИЙ.`;

/**
 * Создание отредактированной (refined) ревизии статьи на основе отчета аудита
 * 
 * @param originalMarkdown Исходный текст статьи
 * @param auditReport Отчет аудита с замечаниями
 * @param options Дополнительные инструкции оператора и модель
 */
export async function refineArticle(
  originalMarkdown: string,
  auditReport: ArticleAuditReport,
  options?: {
    customInstructions?: string;
    model?: GeminiModelId;
    signal?: AbortSignal;
  }
): Promise<string> {
  const model = options?.model || DEFAULT_MODEL;

  const issuesList = auditReport.issues
    .map((iss, i) => `${i + 1}. [${iss.severity.toUpperCase()}] ${iss.title}: "${iss.originalSnippet}" -> Решение: ${iss.suggestedFix || iss.explanation}`)
    .join('\n');

  const suggestionsList = auditReport.suggestions
    .map((sug, i) => `${i + 1}. [Влияние: ${sug.impact}] ${sug.title}: ${sug.recommendation}`)
    .join('\n');

  const userPrompt = `Перепиши и улучши следующую статью базы знаний.

ИСПРАВЬ ВЫЯВЛЕННЫЕ ДЕФЕКТЫ:
${issuesList || 'Существенных дефектов нет, сосредоточься на улучшении ясности.'}

УЧТИ РЕКОМЕНДАЦИИ:
${suggestionsList || 'Сделай структуру максимально четкой.'}

${options?.customInstructions ? `ДОПОЛНИТЕЛЬНЫЕ ТРЕБОВАНИЯ ОПЕРАТОРА:\n${options.customInstructions}\n` : ''}

ИСХОДНЫЙ ТЕКСТ СТАТЬИ:
---
${originalMarkdown}
---

Сформируй обновленный Markdown статьи:`;

  const response = await callGemini(
    model,
    [{ role: 'user', parts: [{ text: userPrompt }] }],
    {
      systemInstruction: REFINE_SYSTEM_PROMPT,
      signal: options?.signal
    }
  );

  let cleaned = response.text.trim();
  // Снимаем обрамляющий блок ```markdown ... ``` если модель его добавила
  if (cleaned.startsWith('```markdown')) {
    cleaned = cleaned.replace(/^```markdown\n/, '').replace(/\n```$/, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '').trim();
  }

  return cleaned;
}

/**
 * Прицельное исправление одного точечного замечания в статье
 * 
 * @param markdown Текущий текст статьи
 * @param issue Замечание для исправления
 * @param model Модель ИИ
 * @param signal Сигнал отмены
 */
export async function applySingleFix(
  markdown: string,
  issue: AuditIssue,
  model: GeminiModelId = DEFAULT_MODEL,
  signal?: AbortSignal
): Promise<string> {
  const prompt = `В статье базы знаний необходимо точечно исправить следующее замечание:
Замечание: ${issue.title}
Фрагмент с ошибкой: "${issue.originalSnippet}"
Предлагаемое исправление: "${issue.suggestedFix}"
Пояснение: ${issue.explanation}

ИСХОДНАЯ СТАТЬЯ:
---
${markdown}
---

Верни обновленный Markdown статьи целиком с внесенным исправлением. Не меняй остальные части статьи. Без лишних комментариев.`;

  const response = await callGemini(
    model,
    [{ role: 'user', parts: [{ text: prompt }] }],
    {
      systemInstruction: 'Ты — точный редактор текста. Внеси указанную правку в текст, сохранив остальной документ неизменным.',
      signal
    }
  );

  let cleaned = response.text.trim();
  if (cleaned.startsWith('```markdown')) {
    cleaned = cleaned.replace(/^```markdown\n/, '').replace(/\n```$/, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '').trim();
  }

  return cleaned;
}

// ============================================================================
// 3. DIFF-АНАЛИЗАТОР И СРАВНЕНИЕ РЕВИЗИЙ
// ============================================================================

/**
 * Построчный расчет различий между исходной и отредактированной версиями статьи
 * 
 * @param original Исходный Markdown
 * @param refined Отредактированный Markdown
 */
export function computeDiffSummary(original: string, refined: string): AuditDiffSummary {
  const origLines = original ? original.split(/\r?\n/) : [];
  const refLines = refined ? refined.split(/\r?\n/) : [];

  const changes: AuditDiffLine[] = [];
  const modifiedSectionsSet = new Set<string>();

  let origIdx = 0;
  let refIdx = 0;
  let addedCount = 0;
  let removedCount = 0;

  // Простое и быстрое сопоставление строк
  while (origIdx < origLines.length || refIdx < refLines.length) {
    const oLine = origLines[origIdx];
    const rLine = refLines[refIdx];

    if (origIdx < origLines.length && refIdx < refLines.length && oLine === rLine) {
      changes.push({
        type: 'unchanged',
        text: oLine,
        lineNumOld: origIdx + 1,
        lineNumNew: refIdx + 1
      });
      origIdx++;
      refIdx++;
    } else if (refIdx < refLines.length && (origIdx >= origLines.length || !origLines.slice(origIdx).includes(rLine))) {
      changes.push({
        type: 'added',
        text: rLine,
        lineNumNew: refIdx + 1
      });
      addedCount++;
      if (rLine.startsWith('#')) {
        modifiedSectionsSet.add(rLine.replace(/^#+\s*/, '').trim());
      }
      refIdx++;
    } else if (origIdx < origLines.length) {
      changes.push({
        type: 'removed',
        text: oLine,
        lineNumOld: origIdx + 1
      });
      removedCount++;
      if (oLine.startsWith('#')) {
        modifiedSectionsSet.add(oLine.replace(/^#+\s*/, '').trim());
      }
      origIdx++;
    }
  }

  // Генерация unified diff формата
  const unifiedHeader = `--- Исходная версия (${origLines.length} строк)\n+++ Новая ревизия (${refLines.length} строк)\n`;
  const unifiedBody = changes
    .filter(c => c.type !== 'unchanged')
    .map(c => `${c.type === 'added' ? '+' : '-'} ${c.text}`)
    .slice(0, 200) // Ограничиваем первые 200 строк для производительности
    .join('\n');

  return {
    addedLines: addedCount,
    removedLines: removedCount,
    modifiedSections: Array.from(modifiedSectionsSet),
    unifiedDiff: unifiedHeader + (unifiedBody || 'Изменений не обнаружено'),
    changes
  };
}

// ============================================================================
// 4. УПРАВЛЕНИЕ СОСТОЯНИЕМ СЕССИИ АУДИТА (SESSION STATE HELPERS)
// ============================================================================

/**
 * Создание начального состояния сессии аудита
 */
export function createInitialAuditSession(page: BookStackPage | null = null): AuditSessionState {
  const markdown = page?.markdown || '';
  return {
    selectedPage: page,
    originalMarkdown: markdown,
    refinedMarkdown: markdown,
    isAuditing: false,
    isRefining: false,
    isSaving: false,
    isRollingBack: false,
    diff: null,
    auditReport: null,
    error: null,
    lastSavedAt: null,
    snapshotHistory: page ? [createPageSnapshot(page, 'Инициализация сессии')] : []
  };
}

/**
 * Применение отчета аудита к состоянию сессии
 */
export function applyAuditToSession(
  state: AuditSessionState,
  report: ArticleAuditReport
): AuditSessionState {
  return {
    ...state,
    isAuditing: false,
    auditReport: report,
    error: null
  };
}

/**
 * Применение сгенерированной ревизии к сессии с перерасчетом Diff
 */
export function applyRefinementToSession(
  state: AuditSessionState,
  refinedMarkdown: string
): AuditSessionState {
  const diff = computeDiffSummary(state.originalMarkdown, refinedMarkdown);
  return {
    ...state,
    isRefining: false,
    refinedMarkdown,
    diff,
    error: null
  };
}

/**
 * Добавление нового снимка в историю сессии
 */
export function addSnapshotToSession(
  state: AuditSessionState,
  snapshot: BookStackPageSnapshot
): AuditSessionState {
  return {
    ...state,
    snapshotHistory: [snapshot, ...(state.snapshotHistory || [])].slice(0, 10) // храним до 10 последних снимков
  };
}
