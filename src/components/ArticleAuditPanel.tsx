import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  Search,
  BookOpen,
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  ExternalLink,
  ArrowRight,
  SlidersHorizontal,
  SplitSquareHorizontal,
  AlignLeft,
  Check,
  UploadCloud,
  History,
  AlertCircle,
  Copy,
  Layers,
  Wand2,
  Trash2,
  Eye,
  Code,
  Flame,
  FileCheck,
  Cpu,
  X,
  Lightbulb,
  ShieldAlert,
  Plus,
  Minus,
  FileCode,
  Edit3,
  Save,
  RotateCcw,
  Undo2,
  PenLine
} from 'lucide-react';
import { BookStackCredentials, BookStackBook, BookStackChapter, BookStackPage, ArticleAuditResult, AuditIssue, QualityScorecard, ArticleAuditChangeItem } from '../types';
import { fetchBooks, fetchChaptersAndPages, fetchPage, updatePage, searchPages } from '../services/api';
import { callGemini, GEMINI_MODELS, GeminiModelId, DEFAULT_MODEL, convertCalloutsToBookStackHtml } from '../services/gemini';
import { AEMarkdown } from './AEMarkdown';

export interface ArticleAuditPanelProps {
  credentials: BookStackCredentials;
  geminiModel?: GeminiModelId;
  onPageUpdated?: (pageId: number, title: string) => void;
  initialPageId?: number | null;
}

function generateChangesFromIssues(issues: AuditIssue[]): ArticleAuditChangeItem[] {
  if (!issues || issues.length === 0) {
    return [
      {
        type: 'modified',
        category: 'humanity',
        title: 'Комплексная ревизия статьи',
        description: 'Улучшена структура и оформление статьи в соответствии со стандартами базы знаний.'
      }
    ];
  }
  return issues.map(iss => {
    const isSlop = iss.category === 'slop' || iss.rule?.toLowerCase().includes('slop');
    const isFormatting = iss.category === 'formatting' || iss.rule?.toLowerCase().includes('callout');
    const isStructure = iss.category === 'structure' || iss.rule?.toLowerCase().includes('workaround');
    let type: 'removed' | 'added' | 'modified' = 'modified';
    if (isSlop) type = 'removed';
    else if (isFormatting || isStructure) type = 'added';

    return {
      type,
      category: iss.category || 'humanity',
      title: iss.title,
      description: iss.suggestion || iss.explanation || 'Улучшение статьи',
      oldSnippet: iss.originalSnippet,
      newSnippet: iss.suggestedFix || iss.suggestion
    };
  });
}

// --------------------------------------------------------------------------
// MOCK DATA ДЛЯ ДЕМО-РЕЖИМА (когда BookStack не подключен или пуст)
// --------------------------------------------------------------------------
const DEMO_BOOKS: BookStackBook[] = [
  { id: 101, name: 'ИТ-Инфраструктура и Сети', description: 'Регламенты серверов, VPN, шлюзов и балансировщиков' },
  { id: 102, name: 'Техническая поддержка (L2/L3)', description: 'База инцидентов, типовые решения и воркараунды' },
  { id: 103, name: 'Корпоративные сервисы', description: 'Инструкции для пользователей: почта, SSO, CRM' },
];

const DEMO_CHAPTERS: Record<number, BookStackChapter[]> = {
  101: [
    { id: 201, book_id: 101, name: 'Сетевой доступ и VPN', description: 'Wireguard, OpenVPN, маршрутизация' },
    { id: 202, book_id: 101, name: 'Серверы баз данных', description: 'PostgreSQL, Redis, резервное копирование' },
  ],
  102: [
    { id: 203, book_id: 102, name: 'Биллинг и Платежи', description: 'Диагностика зависших транзакций' },
  ],
  103: [],
};

const DEMO_PAGES: Record<number, { title: string; markdown: string; bookId: number; chapterId?: number }> = {
  301: {
    bookId: 101,
    chapterId: 201,
    title: 'Настройка WireGuard VPN для удаленных инженеров',
    markdown: `# Введение в технологию настройки WireGuard VPN

В современном мире цифровой трансформации удаленная работа приобретает колоссальное и фундаментальное значение. Как показывает многолетняя практика ведущих мировых архитекторов сетевой безопасности, защищенный периметр — это не просто сервер, это целая философия надежности. Давайте подробно погрузимся в то, почему это важно для каждого сотрудника.

Вопрос не в технологии. Вопрос в безопасной парадигме. То, о чем многие забывают: WireGuard действительно меняет правила игры в корпоративном секторе.

## Осуществление подключения

Для реализации процесса инициализации сетевого подключения сотруднику необходимо выполнить скачивание конфигурационного файла из защищенного портала. После этого надлежит произвести инсталляцию клиентского приложения WireGuard на пользовательскую рабочую станцию под управлением Windows или macOS.

> Внимание: не передавайте ключи третьим лицам.

Если вдруг соединение оборвалось, то возможно произошла непредвиденная ошибка на шлюзе. В таком случае рекомендуется осуществить перезагрузку сервиса или связаться с дежурным администратором.

Ведь в конце концов, информационная безопасность — это зеркало профессиональной ответственности компании перед заказчиками.`
  },
  302: {
    bookId: 102,
    chapterId: 203,
    title: 'Регламент устранения сбоя синхронизации платежей биллинга',
    markdown: `# Регламент по биллингу

Ввиду возникновения определенных технических сложностей при синхронизации реестров оплат с внешним шлюзом банка, периодически имеет место быть накопление зависших очередей в Redis.

Секрет устранения сбоя: перезапуск фонового демона worker-billing.

Для этого войдите на сервер:
\`\`\`bash
systemctl restart worker-billing
\`\`\`

После этого статус транзакций должен нормализоваться.`
  }
};

// --------------------------------------------------------------------------
// --------------------------------------------------------------------------
// ПОЛНОЦЕННЫЙ LCS ДИФФ-ДВИЖОК (Side-by-side, Inline & Word-level diffing)
// --------------------------------------------------------------------------
export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  oldLineNumber?: number;
  newLineNumber?: number;
  text: string;
}

export interface DiffWordToken {
  text: string;
  type: 'added' | 'removed' | 'unchanged';
}

export interface SideBySideCell {
  lineNum?: number;
  text: string;
  type: 'added' | 'removed' | 'unchanged' | 'empty';
  wordTokens?: DiffWordToken[];
}

export interface SideBySideRow {
  left: SideBySideCell;
  right: SideBySideCell;
  isChanged: boolean;
}

export interface DiffCalculationResult {
  unified: DiffLine[];
  sideBySide: SideBySideRow[];
  addedCount: number;
  removedCount: number;
  unchangedCount: number;
}

/**
 * Расчет пословного / посимвольного диффа внутри измененной строки
 */
function computeWordTokens(oldText: string, newText: string): {
  oldWords: DiffWordToken[];
  newWords: DiffWordToken[];
} {
  if (!oldText && !newText) {
    return { oldWords: [], newWords: [] };
  }
  if (!oldText) {
    return {
      oldWords: [],
      newWords: [{ text: newText, type: 'added' }],
    };
  }
  if (!newText) {
    return {
      oldWords: [{ text: oldText, type: 'removed' }],
      newWords: [],
    };
  }

  // Токенизация с сохранением пробелов и спецсимволов
  const oldTokens = oldText.match(/\S+|\s+/g) || [];
  const newTokens = newText.match(/\S+|\s+/g) || [];

  // Ограничитель сложности для очень длинных строк
  if (oldTokens.length > 90 || newTokens.length > 90) {
    return {
      oldWords: [{ text: oldText, type: 'removed' }],
      newWords: [{ text: newText, type: 'added' }],
    };
  }

  const M = oldTokens.length;
  const N = newTokens.length;
  const dp: number[][] = Array.from({ length: M + 1 }, () => new Array(N + 1).fill(0));

  for (let i = 1; i <= M; i++) {
    for (let j = 1; j <= N; j++) {
      if (oldTokens[i - 1] === newTokens[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  let i = M;
  let j = N;
  const tempOld: DiffWordToken[] = [];
  const tempNew: DiffWordToken[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
      tempOld.push({ text: oldTokens[i - 1], type: 'unchanged' });
      tempNew.push({ text: newTokens[j - 1], type: 'unchanged' });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      tempNew.push({ text: newTokens[j - 1], type: 'added' });
      j--;
    } else if (i > 0 && (j === 0 || dp[i - 1][j] > dp[i][j - 1])) {
      tempOld.push({ text: oldTokens[i - 1], type: 'removed' });
      i--;
    }
  }

  return {
    oldWords: tempOld.reverse(),
    newWords: tempNew.reverse(),
  };
}

/**
 * Точный классический алгоритм LCS (Longest Common Subsequence)
 * с предварительным отсечением одинаковых префиксов и суффиксов.
 */
function computeLcsDiff(oldText: string, newText: string): DiffCalculationResult {
  const oldLines = (oldText ?? '').split('\n');
  const newLines = (newText ?? '').split('\n');

  // Оптимизация 1: отсечение совпадающего префикса
  let prefixLen = 0;
  while (
    prefixLen < oldLines.length &&
    prefixLen < newLines.length &&
    oldLines[prefixLen] === newLines[prefixLen]
  ) {
    prefixLen++;
  }

  // Оптимизация 2: отсечение совпадающего суффикса
  let suffixLen = 0;
  while (
    suffixLen < oldLines.length - prefixLen &&
    suffixLen < newLines.length - prefixLen &&
    oldLines[oldLines.length - 1 - suffixLen] === newLines[newLines.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const midOld = oldLines.slice(prefixLen, oldLines.length - suffixLen);
  const midNew = newLines.slice(prefixLen, newLines.length - suffixLen);

  const M = midOld.length;
  const N = midNew.length;

  const midUnified: DiffLine[] = [];

  if (M === 0 && N === 0) {
    // В середине нет изменений
  } else if (M === 0) {
    for (let j = 0; j < N; j++) {
      midUnified.push({
        type: 'added',
        newLineNumber: prefixLen + j + 1,
        text: midNew[j],
      });
    }
  } else if (N === 0) {
    for (let i = 0; i < M; i++) {
      midUnified.push({
        type: 'removed',
        oldLineNumber: prefixLen + i + 1,
        text: midOld[i],
      });
    }
  } else {
    // Матрица динамического программирования для середины
    const dp: number[][] = Array.from({ length: M + 1 }, () => new Array(N + 1).fill(0));
    for (let i = 1; i <= M; i++) {
      for (let j = 1; j <= N; j++) {
        if (midOld[i - 1] === midNew[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    let i = M;
    let j = N;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && midOld[i - 1] === midNew[j - 1]) {
        midUnified.push({
          type: 'unchanged',
          oldLineNumber: prefixLen + i,
          newLineNumber: prefixLen + j,
          text: midOld[i - 1],
        });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        midUnified.push({
          type: 'added',
          newLineNumber: prefixLen + j,
          text: midNew[j - 1],
        });
        j--;
      } else if (i > 0 && (j === 0 || dp[i - 1][j] > dp[i][j - 1])) {
        midUnified.push({
          type: 'removed',
          oldLineNumber: prefixLen + i,
          text: midOld[i - 1],
        });
        i--;
      }
    }
    midUnified.reverse();
  }

  // Собираем общий единый поток (Unified Diff)
  const unified: DiffLine[] = [];

  // Префикс
  for (let p = 0; p < prefixLen; p++) {
    unified.push({
      type: 'unchanged',
      oldLineNumber: p + 1,
      newLineNumber: p + 1,
      text: oldLines[p],
    });
  }

  // Середина
  for (const item of midUnified) {
    unified.push(item);
  }

  // Суффикс
  for (let s = 0; s < suffixLen; s++) {
    const oldIdx = oldLines.length - suffixLen + s;
    const newIdx = newLines.length - suffixLen + s;
    unified.push({
      type: 'unchanged',
      oldLineNumber: oldIdx + 1,
      newLineNumber: newIdx + 1,
      text: oldLines[oldIdx],
    });
  }

  // Генерация синхронизированных Side-by-Side строк
  const sideBySide: SideBySideRow[] = [];
  let addedCount = 0;
  let removedCount = 0;
  let unchangedCount = 0;

  let uIdx = 0;
  while (uIdx < unified.length) {
    const item = unified[uIdx];
    if (item.type === 'unchanged') {
      unchangedCount++;
      sideBySide.push({
        left: { lineNum: item.oldLineNumber, text: item.text, type: 'unchanged' },
        right: { lineNum: item.newLineNumber, text: item.text, type: 'unchanged' },
        isChanged: false,
      });
      uIdx++;
    } else {
      // Сборка непрерывного блока изменений
      const removedBlock: DiffLine[] = [];
      const addedBlock: DiffLine[] = [];

      while (uIdx < unified.length && unified[uIdx].type !== 'unchanged') {
        if (unified[uIdx].type === 'removed') {
          removedBlock.push(unified[uIdx]);
          removedCount++;
        } else if (unified[uIdx].type === 'added') {
          addedBlock.push(unified[uIdx]);
          addedCount++;
        }
        uIdx++;
      }

      const maxLen = Math.max(removedBlock.length, addedBlock.length);
      for (let k = 0; k < maxLen; k++) {
        const rem = removedBlock[k];
        const add = addedBlock[k];

        let leftCell: SideBySideCell;
        let rightCell: SideBySideCell;

        if (rem && add) {
          // Замена строки — считаем пословный дифф для подсветки конкретных слов
          const { oldWords, newWords } = computeWordTokens(rem.text, add.text);
          leftCell = {
            lineNum: rem.oldLineNumber,
            text: rem.text,
            type: 'removed',
            wordTokens: oldWords,
          };
          rightCell = {
            lineNum: add.newLineNumber,
            text: add.text,
            type: 'added',
            wordTokens: newWords,
          };
        } else if (rem) {
          leftCell = {
            lineNum: rem.oldLineNumber,
            text: rem.text,
            type: 'removed',
          };
          rightCell = {
            text: '',
            type: 'empty',
          };
        } else {
          leftCell = {
            text: '',
            type: 'empty',
          };
          rightCell = {
            lineNum: add.newLineNumber,
            text: add.text,
            type: 'added',
          };
        }

        sideBySide.push({
          left: leftCell,
          right: rightCell,
          isChanged: true,
        });
      }
    }
  }

  return {
    unified,
    sideBySide,
    addedCount,
    removedCount,
    unchangedCount,
  };
}

/**
 * Обратная совместимость для вспомогательных вызовов
 */
function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  return computeLcsDiff(oldText, newText).unified;
}

// --------------------------------------------------------------------------
// ОСНОВНОЙ КОМПОНЕНТ АУДИТА СТАТЕЙ WIKI
// --------------------------------------------------------------------------
export function ArticleAuditPanel({
  credentials,
  geminiModel = DEFAULT_MODEL,
  onPageUpdated,
  initialPageId = null,
}: ArticleAuditPanelProps) {
  // Навигация и выбор статьи
  const [books, setBooks] = useState<BookStackBook[]>([]);
  const [chaptersByBook, setChaptersByBook] = useState<Record<number, BookStackChapter[]>>({});
  const [pagesByChapter, setPagesByChapter] = useState<Record<number, BookStackPage[]>>({});
  const [rootPagesByBook, setRootPagesByBook] = useState<Record<number, BookStackPage[]>>({});
  const [expandedBooks, setExpandedBooks] = useState<Record<number, boolean>>({});
  const [expandedChapters, setExpandedChapters] = useState<Record<number, boolean>>({});
  const [isLoadingTree, setIsLoadingTree] = useState(false);

  // Поиск
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<any>(null);

  // Выбранная страница
  const [selectedPageId, setSelectedPageId] = useState<number | null>(initialPageId);
  const [selectedPageTitle, setSelectedPageTitle] = useState<string>('');
  const [originalMarkdown, setOriginalMarkdown] = useState<string>('');
  const [isLoadingPage, setIsLoadingPage] = useState<boolean>(false);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  // Аудит и состояние ревизии
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditProgressStage, setAuditProgressStage] = useState<string>('');
  const [auditResult, setAuditResult] = useState<ArticleAuditResult | null>(null);

  // Настройки панели управления (скиллы и указания)
  const [activeSkills, setActiveSkills] = useState<Record<string, boolean>>({
    'no-ai-slop': true,
    'humanizer-ru': true,
    'kb-article': true,
    'wiki-architect': true,
    'simplify-code': false,
  });
  const [customInstructions, setCustomInstructions] = useState('');
  const [selectedModel, setSelectedModel] = useState<GeminiModelId>(geminiModel);

  // Режим просмотра Diff: 'side-by-side' (Цветной 2-колоночный, ПО УМОЛЧАНИЮ!), 'inline' (Цветной единый), 'rendered' (Визуальная верстка), 'manual-edit' (Ручные правки)
  const [diffViewMode, setDiffViewMode] = useState<'side-by-side' | 'inline' | 'rendered' | 'manual-edit'>('side-by-side');
  const [activeIssueFilter, setActiveIssueFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [diffLineFilter, setDiffLineFilter] = useState<'all' | 'changed'>('all');

  // Ручные правки улучшенной статьи (ревизии)
  const [aiRefinedMarkdownOriginal, setAiRefinedMarkdownOriginal] = useState<string>('');
  const [aiRefinedTitleOriginal, setAiRefinedTitleOriginal] = useState<string>('');
  const [isManualEditingRefined, setIsManualEditingRefined] = useState<boolean>(false);
  const refinedTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Ручной редактор исходной статьи (до/без ИИ-аудита)
  const [editedOriginalTitle, setEditedOriginalTitle] = useState<string>('');
  const [editedOriginalMarkdown, setEditedOriginalMarkdown] = useState<string>('');
  const originalTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Вкладка в правой колонке: 'preview' (предпросмотр статьи), 'settings' (настройки ревизии), 'results' (аудит и diff)
  const [activeRightTab, setActiveRightTab] = useState<'preview' | 'settings' | 'results'>('preview');
  const [previewMode, setPreviewMode] = useState<'rendered' | 'raw' | 'edit'>('rendered');
  const [copiedOriginal, setCopiedOriginal] = useState(false);

  // Модальное окно подтверждения перезаписи в BookStack
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmModalData, setConfirmModalData] = useState<{
    type: 'refined' | 'direct_manual';
    title: string;
    markdown: string;
    pageId: number;
    hasManualEdits?: boolean;
    description?: string;
  }>({
    type: 'refined',
    title: '',
    markdown: '',
    pageId: 0,
  });
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);
  const [createBackupTag, setCreateBackupTag] = useState(true);
  const [isSavingToBookStack, setIsSavingToBookStack] = useState(false);
  const [publishStatus, setPublishStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string; url?: string }>({
    type: 'idle',
    message: ''
  });

  const hasManualRefinedEdits = useMemo(() => {
    if (!auditResult || !aiRefinedMarkdownOriginal) return false;
    return (
      auditResult.refinedMarkdown !== aiRefinedMarkdownOriginal ||
      auditResult.refinedTitle !== aiRefinedTitleOriginal
    );
  }, [auditResult, aiRefinedMarkdownOriginal, aiRefinedTitleOriginal]);

  // 1. Загрузка дерева BookStack
  const loadKnowledgeBaseTree = async () => {
    setIsLoadingTree(true);
    try {
      if (credentials.baseUrl) {
        const fetchedBooks = await fetchBooks(credentials);
        if (fetchedBooks && fetchedBooks.length > 0) {
          setBooks(fetchedBooks);
          setIsDemoMode(false);
          // Развернем первую книгу
          setExpandedBooks({ [fetchedBooks[0].id]: true });
          await loadBookContents(fetchedBooks[0].id);
          setIsLoadingTree(false);
          return;
        }
      }
      // Fallback на демонстрационные данные
      setBooks(DEMO_BOOKS);
      setChaptersByBook(DEMO_CHAPTERS);
      setIsDemoMode(true);
      setExpandedBooks({ 101: true });
      setExpandedChapters({ 201: true });
      // Автовыбор первой демонстрационной страницы
      handleSelectDemoPage(301);
    } catch (err) {
      console.warn('Не удалось загрузить живые книги BookStack, переключение в демо-режим:', err);
      setBooks(DEMO_BOOKS);
      setChaptersByBook(DEMO_CHAPTERS);
      setIsDemoMode(true);
      setExpandedBooks({ 101: true });
      setExpandedChapters({ 201: true });
      handleSelectDemoPage(301);
    } finally {
      setIsLoadingTree(false);
    }
  };

  const loadBookContents = async (bookId: number) => {
    if (isDemoMode) return;
    try {
      const data = await fetchChaptersAndPages(credentials, bookId);
      setChaptersByBook(prev => ({ ...prev, [bookId]: data.chapters || [] }));
      setRootPagesByBook(prev => ({ ...prev, [bookId]: data.pages || [] }));
    } catch (e) {
      console.error(`Ошибка загрузки содержимого книги ${bookId}:`, e);
    }
  };

  const loadChapterContents = async (chapterId: number) => {
    if (isDemoMode) return;
    try {
      const { fetchChapterPages } = await import('../services/api');
      const pages = await fetchChapterPages(credentials, chapterId);
      setPagesByChapter(prev => ({ ...prev, [chapterId]: pages || [] }));
    } catch (e) {
      console.error(`Ошибка загрузки страниц главы ${chapterId}:`, e);
    }
  };

  useEffect(() => {
    loadKnowledgeBaseTree();
  }, [credentials.baseUrl]);

  // Живой поиск
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        if (!isDemoMode && credentials.baseUrl) {
          const results = await searchPages(credentials, searchQuery);
          setSearchResults(results || []);
        } else {
          // Поиск по демо-данным
          const q = searchQuery.toLowerCase();
          const demoMatches = Object.entries(DEMO_PAGES)
            .filter(([_, page]) => page.title.toLowerCase().includes(q) || page.markdown.toLowerCase().includes(q))
            .map(([id, page]) => ({
              id: Number(id),
              name: page.title,
              type: 'page',
              preview_html: { name: page.title },
              book_id: page.bookId,
            }));
          setSearchResults(demoMatches);
        }
      } catch (err) {
        console.error('Ошибка живого поиска по базе знаний:', err);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(searchTimeoutRef.current);
  }, [searchQuery, isDemoMode, credentials.baseUrl]);

  // Выбор страницы
  const handleSelectPage = async (pageId: number, titleHint?: string) => {
    setSelectedPageId(pageId);
    setIsLoadingPage(true);
    setAuditResult(null);
    setPublishStatus({ type: 'idle', message: '' });
    setActiveRightTab('preview');

    if (isDemoMode || DEMO_PAGES[pageId]) {
      handleSelectDemoPage(pageId);
      setIsLoadingPage(false);
      return;
    }

    try {
      const fullPage = await fetchPage(credentials, pageId);
      const title = fullPage.name || titleHint || `Страница #${pageId}`;
      const md = fullPage.markdown || fullPage.html || '';
      setSelectedPageTitle(title);
      setOriginalMarkdown(md);
      setEditedOriginalTitle(title);
      setEditedOriginalMarkdown(md);
      setPreviewMode('rendered');
      setIsManualEditingRefined(false);
    } catch (err: any) {
      console.error('Ошибка загрузки страницы BookStack:', err);
      // Fallback
      if (DEMO_PAGES[301]) handleSelectDemoPage(301);
    } finally {
      setIsLoadingPage(false);
    }
  };

  const handleSelectDemoPage = (pageId: number) => {
    const demo = DEMO_PAGES[pageId] || DEMO_PAGES[301];
    setSelectedPageId(pageId);
    setSelectedPageTitle(demo.title);
    setOriginalMarkdown(demo.markdown);
    setEditedOriginalTitle(demo.title);
    setEditedOriginalMarkdown(demo.markdown);
    setPreviewMode('rendered');
    setIsManualEditingRefined(false);
    setActiveRightTab('preview');
  };

  // --------------------------------------------------------------------------
  // ЗАПУСК ИИ-АУДИТА И РЕВИЗИИ СТАТЬИ
  // --------------------------------------------------------------------------
  const runArticleAuditAndRefine = async () => {
    if (!originalMarkdown || !selectedPageId) return;

    setIsAuditing(true);
    setPublishStatus({ type: 'idle', message: '' });

    try {
      setAuditProgressStage('Лингвистический аудит (паттерны no-ai-slop и humanizer-ru)...');

      // Формируем системные требования из активных скиллов
      const activeSkillsList = Object.entries(activeSkills)
        .filter(([_, active]) => active)
        .map(([key]) => key);

      const prompt = `Ты — ведущий редактор корпоративной базы знаний BookStack, сертифицированный эксперт по humanizer-ru и no-ai-slop.
Твоя задача — провести строгий аудит качества статьи и создать ее улучшенную редакцию (Refined Wiki Article).

ОРИГИНАЛЬНАЯ СТАТЬЯ ИЗ BOOKSTACK:
Название: ${selectedPageTitle}
Markdown:
${originalMarkdown}

ДОПОЛНИТЕЛЬНЫЕ УКАЗАНИЯ ПОЛЬЗОВАТЕЛЯ:
${customInstructions || 'Максимально лаконично, структурированно, полезно для дежурных инженеров.'}

АКТИВНЫЕ РЕДАКТОРСКИЕ НАВЫКИ:
${activeSkillsList.join(', ')}

ПРАВИЛА И СТАНДАРТЫ:
1. no-ai-slop: Беспощадно вырежи "расчистку горла" (Throat-clearing), бинарные контрасты ("Вопрос не в...", "Это не просто..."), откровения через двоеточие ("Секрет в:"), пафосные финалы и стоп-слова ("погружаться", "меняет правила игры", "в современном мире").
2. humanizer-ru: Ликвидируй канцелярский паралич (цепочки существительных в родительном падеже). Замени отглагольные существительные на глаголы действия ("осуществить инсталляцию" -> "установите"). Сохраняй жесткий "факт-замок" (не придумывай несуществующие шаги).
3. kb-article: Структурируй статью по стандарту BookStack: 
   - Симптомы / Контекст (кратко TL;DR)
   - Диагностика
   - Пошаговое решение (нумерованные шаги, чистые блоки кода с указанием языка bash/yaml/sql)
   - Воркараунд / Обходной путь (если применимо)
4. formatting: Используй нативные блоки внимания BookStack:
   > [!NOTE] Ключевая информация
   > [!WARNING] Риск потери данных или сбоя
   > [!TIP] Полезный совет

ВЕРНИ ОТВЕТ СТРОГО В ВИДЕ JSON БЕЗ ЛИШНЕГО ТЕКСТА:
{
  "scorecard": {
    "overallScore": 65,
    "humanityScore": 60,
    "antiSlopScore": 45,
    "structureScore": 75,
    "formattingScore": 70
  },
  "issues": [
    {
      "id": "iss-1",
      "category": "slop",
      "severity": "critical",
      "title": "Риторическая преамбула (Throat Clearing)",
      "rule": "no-ai-slop: throat-clearing",
      "originalSnippet": "В современном мире цифровой трансформации...",
      "suggestion": "Начните сразу с целевого регламента и назначения сервиса.",
      "explanation": "Инженерам и сотрудникам поддержки не нужна философия и вводные банальности."
    },
    {
      "id": "iss-2",
      "category": "humanity",
      "severity": "warning",
      "title": "Канцелярит и отглагольный паралич",
      "rule": "humanizer-ru: verb-action",
      "originalSnippet": "произвести инсталляцию клиентского приложения",
      "suggestion": "установите клиент WireGuard",
      "explanation": "Глаголы действия ускоряют чтение и снижают когнитивную нагрузку."
    },
    {
      "id": "iss-3",
      "category": "structure",
      "severity": "warning",
      "title": "Размытый раздел воркараунда",
      "rule": "kb-article: actionable-workaround",
      "originalSnippet": "связаться с дежурным администратором",
      "suggestion": "Выделите в блок > [!WARNING] с контактами дежурного чата и шагами первичной диагностики.",
      "explanation": "Инструкция должна содержать конкретные пути эскалации инцидента."
    },
    {
      "id": "iss-4",
      "category": "formatting",
      "severity": "info",
      "title": "Простая цитата вместо Callout BookStack",
      "rule": "formatting: bookstack-callouts",
      "originalSnippet": "> Внимание: не передавайте ключи",
      "suggestion": "> [!CAUTION] Не передавайте конфигурационные файлы и ключи третьим лицам.",
      "explanation": "Нативные callout-блоки BookStack визуально выделяются цветовой плашкой в интерфейсе вики."
    }
  ],
  "changesSummary": [
    {
      "type": "removed",
      "category": "slop",
      "title": "Удалена риторическая преамбула (слоп)",
      "description": "Вырезаны общие рассуждения о важности удаленной работы.",
      "oldSnippet": "В современном мире цифровой трансформации..."
    },
    {
      "type": "modified",
      "category": "humanity",
      "title": "Канцелярит заменен глаголами действия",
      "description": "Заменена фраза 'произвести инсталляцию' на 'установите клиент WireGuard'.",
      "oldSnippet": "произвести инсталляцию клиентского приложения",
      "newSnippet": "установите клиент WireGuard"
    },
    {
      "type": "added",
      "category": "structure",
      "title": "Добавлена матрица диагностики и воркараундов",
      "description": "Оформлена таблица симптомов и шагов обхода сбоев.",
      "newSnippet": "| Симптом | Вероятная причина | Действие / Воркараунд |"
    },
    {
      "type": "added",
      "category": "formatting",
      "title": "Оформлены нативные Callouts BookStack",
      "description": "Преобразованы плоские цитаты в нативные блоки > [!NOTE] и > [!WARNING].",
      "newSnippet": "> [!WARNING] Конфигурационный файл содержит ваш персональный приватный ключ."
    }
  ],
  "refinedTitle": "Настройка WireGuard VPN для удаленных инженеров (Регламент)",
  "refinedDescription": "Пошаговое руководство по установке клиента WireGuard и решению типовых сбоев соединения.",
  "refinedMarkdown": "Готовый улучшенный Markdown статьи...",
  "summary": "Удалено 3 риторических штампа, ликвидирован канцелярский паралич, добавлен TL;DR и структурированный воркараунд."
}`;

      setAuditProgressStage('Синтез улучшенной ревизии с моделью ' + selectedModel + '...');

      let responseText = '';
      try {
        const response = await callGemini(
          selectedModel,
          [{ role: 'user', parts: [{ text: prompt }] }],
          {
            responseMimeType: 'application/json',
            systemInstruction: 'Ты — бескомпромиссный эксперт-редактор Wiki. Отвечай только валидным JSON.'
          }
        );
        responseText = response.text;
      } catch (geminiErr) {
        console.warn('Сетевой вызов Gemini не удался или оффлайн, используем эталонный синтез аудита:', geminiErr);
        // Резервный синтез для демо
        responseText = JSON.stringify({
          scorecard: {
            overallScore: 58,
            humanityScore: 62,
            antiSlopScore: 40,
            structureScore: 70,
            formattingScore: 65
          },
          issues: [
            {
              id: 'iss-1',
              category: 'slop',
              severity: 'critical',
              title: 'Риторическая преамбула (Throat Clearing)',
              rule: 'no-ai-slop: throat-clearing',
              originalSnippet: 'В современном мире цифровой трансформации удаленная работа приобретает колоссальное...',
              suggestion: 'Удалить преамбулу. Начать сразу с назначения документа.',
              explanation: 'Инженеры саппорта ищут решение, а не философские рассуждения о важности удаленной работы.'
            },
            {
              id: 'iss-2',
              category: 'slop',
              severity: 'critical',
              title: 'Бинарное противопоставление и псевдоинсайт',
              rule: 'no-ai-slop: binary-contrasts',
              originalSnippet: 'Вопрос не в технологии. Вопрос в безопасной парадигме.',
              suggestion: 'Удалить пафосную фразу.',
              explanation: 'Искусственная риторическая драма, характерная для сырого ИИ-текста.'
            },
            {
              id: 'iss-3',
              category: 'humanity',
              severity: 'warning',
              title: 'Бюрократический канцелярит',
              rule: 'humanizer-ru: verb-action',
              originalSnippet: 'Для реализации процесса инициализации сетевого подключения сотруднику необходимо выполнить скачивание...',
              suggestion: 'Чтобы подключиться, скачайте конфигурационный файл...',
              explanation: 'Многоэтажные существительные в родительном падеже затрудняют понимание регламента.'
            },
            {
              id: 'iss-4',
              category: 'formatting',
              severity: 'warning',
              title: 'Отсутствие структурированного Callout BookStack',
              rule: 'formatting: bookstack-callouts',
              originalSnippet: '> Внимание: не передавайте ключи третьим лицам.',
              suggestion: '> [!WARNING] Конфигурационные файлы и закрытые ключи строго персональны. Запрещено передавать их третьим лицам.',
              explanation: 'Разметка > [!WARNING] преобразуется в фирменный оранжевый блок внимания BookStack.'
            },
            {
              id: 'iss-5',
              category: 'structure',
              severity: 'info',
              title: 'Отсутствует четкий раздел воркараунда при сбое',
              rule: 'kb-article: actionable-workaround',
              originalSnippet: 'Если вдруг соединение оборвалось... рекомендуется осуществить перезагрузку сервиса',
              suggestion: 'Оформить H2 «Диагностика и устранение неполадок» со списком кодов ошибок.',
              explanation: 'Сотрудник должен видеть четкую последовательность действий при аварии.'
            }
          ],
          changesSummary: [
            {
              type: 'removed',
              category: 'slop',
              title: 'Удалена риторическая преамбула (слоп)',
              description: 'Вырезаны философские рассуждения о цифровой трансформации и периметре безопасности, не несущие пользы для инженеров.',
              oldSnippet: 'В современном мире цифровой трансформации удаленная работа приобретает колоссальное и фундаментальное значение...'
            },
            {
              type: 'removed',
              category: 'slop',
              title: 'Ликвидирован бинарный контраст',
              description: 'Удалена искусственная риторическая фраза-клише "Вопрос не в... Вопрос в...".',
              oldSnippet: 'Вопрос не в технологии. Вопрос в безопасной парадигме.'
            },
            {
              type: 'modified',
              category: 'humanity',
              title: 'Канцелярит заменен глаголами действия',
              description: 'Устранены громоздкие цепочки существительных в родительном падеже ("для реализации процесса инициализации...") в пользу прямого действия.',
              oldSnippet: 'Для реализации процесса инициализации сетевого подключения сотруднику необходимо выполнить скачивание...',
              newSnippet: 'Чтобы подключиться, скачайте конфигурационный файл...'
            },
            {
              type: 'added',
              category: 'structure',
              title: 'Добавлена матрица диагностики и воркараундов',
              description: 'Сформирована сводная таблица типичных неполадок: симптом, вероятная причина и готовое действие для быстрого решения.',
              newSnippet: '| Симптом | Вероятная причина | Действие / Воркараунд |\n| :--- | :--- | :--- |\n| Индикатор серый | Закрыт UDP-порт 51820 | Переключитесь на OpenVPN TCP 443 |'
            },
            {
              type: 'added',
              category: 'formatting',
              title: 'Оформлены нативные Callouts BookStack',
              description: 'Обычная цитата преобразована в нативные блоки > [!NOTE], > [!WARNING] с цветовой подсветкой важности.',
              oldSnippet: '> Внимание: не передавайте ключи третьим лицам.',
              newSnippet: '> [!WARNING]\n> Конфигурационный файл содержит ваш персональный приватный ключ. Запрещено передавать его третьим лицам.'
            }
          ],
          refinedTitle: 'Настройка WireGuard VPN для удаленных инженеров',
          refinedDescription: 'Пошаговый регламент установки VPN-клиента, импорта профиля и устранения сбоев подключения.',
          refinedMarkdown: `> [!NOTE]
> Данный регламент описывает подключение к корпоративной сети компании через шлюз WireGuard.
> Время настройки: **5 минут**. Требуется учетная запись корпоративного каталога.

## 1. Подготовка и получение конфигурации

1. Авторизуйтесь в личном кабинете сотрудника: \`https://vpn-portal.company.internal\`.
2. В разделе **«Устройства»** нажмите **«Сгенерировать профиль»**.
3. Сохраните полученный файл конфигурации \`wg-corp.conf\`.

> [!WARNING]
> Конфигурационный файл содержит ваш персональный приватный ключ. Категорически запрещено пересылать его в общие чаты или на личные почтовые ящики.

## 2. Установка клиента

* **Windows:** Скачайте официальный дистрибутив с портала и установите сервис.
* **macOS:** Установите клиент из Mac App Store или через brew:
  \`\`\`bash
  brew install --cask wireguard-tools
  \`\`\`
* **Linux (Ubuntu/Debian):**
  \`\`\`bash
  sudo apt install wireguard resolvconf -y
  sudo cp wg-corp.conf /etc/wireguard/wg0.conf
  sudo wg-quick up wg0
  \`\`\`

## 3. Импорт профиля и запуск

1. Откройте клиентское приложение WireGuard.
2. Нажмите кнопку **«Добавить туннель»** (Add Tunnel) и выберите файл \`wg-corp.conf\`.
3. Нажмите **«Активировать»**. При успешном подключении индикатор состояния станет зеленым, а счетчик переданных байт начнет увеличиваться.

## 4. Диагностика и воркараунд при сбоях

| Симптом | Вероятная причина | Действие / Воркараунд |
| :--- | :--- | :--- |
| Индикатор серый, статус «Handshake failed» | Закрыт UDP-порт 51820 провайдером | Переключитесь на резервный профиль TCP (OpenVPN Port 443) |
| Туннель активен, но внутренние ресурсы недоступны | Сбой корпоративного DNS | Проверьте: \`nslookup wiki.company.internal\` |
| Обрыв соединения каждые 30 минут | NAT Keepalive timeout | Добавьте в секцию \`[Peer]\`: \`PersistentKeepalive = 25\` |

> [!TIP]
> При сохранении проблемы свяжитесь с дежурным инженером в Mattermost-канале **#noc-support** с приложением вывода команды \`wg show\`.`,
          summary: 'Устранена риторическая преамбула (слоп), ликвидирован канцелярский стиль, добавлены фирменные Callouts BookStack и матрица воркараундов.'
        });
      }

      setAuditProgressStage('Формирование карточек замечаний и diff...');

      let parsed: any = {};
      try {
        parsed = typeof responseText === 'string' ? JSON.parse(responseText) : responseText;
      } catch (e) {
        // Очистка от markdown оберток
        const clean = responseText.replace(/```json\n?|```/g, '').trim();
        parsed = JSON.parse(clean);
      }

      const originalWordCount = originalMarkdown.trim().split(/\s+/).length;
      const refinedWordCount = (parsed.refinedMarkdown || '').trim().split(/\s+/).length;
      const reduction = Math.round(((originalWordCount - refinedWordCount) / originalWordCount) * 100);

      const diff = computeLcsDiff(originalMarkdown, parsed.refinedMarkdown || '');
      const addedLines = diff.addedCount;
      const removedLines = diff.removedCount;

      const finalRefinedMarkdown = parsed.refinedMarkdown || originalMarkdown;
      const finalRefinedTitle = parsed.refinedTitle || selectedPageTitle;
      setAiRefinedMarkdownOriginal(finalRefinedMarkdown);
      setAiRefinedTitleOriginal(finalRefinedTitle);
      setIsManualEditingRefined(false);
      setDiffViewMode('side-by-side');

      const result: ArticleAuditResult = {
        pageId: selectedPageId,
        originalTitle: selectedPageTitle,
        originalMarkdown: originalMarkdown,
        refinedTitle: finalRefinedTitle,
        refinedMarkdown: finalRefinedMarkdown,
        refinedDescription: parsed.refinedDescription || '',
        scorecard: parsed.scorecard || {
          overallScore: 70,
          humanityScore: 70,
          antiSlopScore: 70,
          structureScore: 70,
          formattingScore: 70,
        },
        issues: parsed.issues || [],
        changesSummary: (parsed.changesSummary && parsed.changesSummary.length > 0)
          ? parsed.changesSummary
          : generateChangesFromIssues(parsed.issues || []),
        summary: parsed.summary || 'Аудит успешно выполнен.',
        analyzedAt: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        modelUsed: selectedModel,
        hasManualEdits: false,
        aiOriginalMarkdown: finalRefinedMarkdown,
        aiOriginalTitle: finalRefinedTitle,
        stats: {
          originalWords: originalWordCount,
          refinedWords: refinedWordCount,
          reductionPercent: reduction,
          addedLines,
          removedLines,
        }
      };

      setAuditResult(result);
      setActiveRightTab('results');
    } catch (err: any) {
      console.error('Ошибка в процессе аудита статьи:', err);
      alert('Ошибка аудита: ' + (err.message || String(err)));
    } finally {
      setIsAuditing(false);
      setAuditProgressStage('');
    }
  };

  // --------------------------------------------------------------------------
  // ОБРАБОТЧИКИ РУЧНЫХ ПРАВОК
  // --------------------------------------------------------------------------
  const insertMarkdownSnippet = (
    textareaRef: React.RefObject<HTMLTextAreaElement | null>,
    currentText: string,
    setText: (text: string) => void,
    prefix: string,
    suffix: string = '',
    placeholder: string = ''
  ) => {
    const el = textareaRef.current;
    if (!el) {
      setText(currentText + '\n' + prefix + placeholder + suffix);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = currentText.substring(start, end) || placeholder;
    const replacement = prefix + selected + suffix;
    const newText = currentText.substring(0, start) + replacement + currentText.substring(end);
    setText(newText);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 0);
  };

  const renderEditorToolbar = (
    textareaRef: React.RefObject<HTMLTextAreaElement | null>,
    currentText: string,
    onChangeText: (val: string) => void
  ) => (
    <div className="flex flex-wrap items-center gap-1.5 p-2 bg-editorial-bg-alt/70 border-b border-editorial-border text-xs">
      <span className="text-[10px] font-bold uppercase tracking-wider text-editorial-muted mr-1 select-none flex items-center gap-1">
        <PenLine size={12} /> Вставка:
      </span>
      <button
        type="button"
        onClick={() => insertMarkdownSnippet(textareaRef, currentText, onChangeText, '## ', '', 'Заголовок раздела')}
        className="px-2 py-0.5 rounded bg-white hover:bg-zinc-100 border border-editorial-border font-bold text-[10px] cursor-pointer shadow-xs transition-colors"
        title="Заголовок H2 (## )"
      >
        H2
      </button>
      <button
        type="button"
        onClick={() => insertMarkdownSnippet(textareaRef, currentText, onChangeText, '### ', '', 'Подраздел')}
        className="px-2 py-0.5 rounded bg-white hover:bg-zinc-100 border border-editorial-border font-bold text-[10px] cursor-pointer shadow-xs transition-colors"
        title="Заголовок H3 (### )"
      >
        H3
      </button>
      <button
        type="button"
        onClick={() => insertMarkdownSnippet(textareaRef, currentText, onChangeText, '**', '**', 'важный текст')}
        className="px-2 py-0.5 rounded bg-white hover:bg-zinc-100 border border-editorial-border font-bold text-[10px] cursor-pointer shadow-xs transition-colors"
        title="Жирный шрифт (**...**)"
      >
        B
      </button>
      <button
        type="button"
        onClick={() => insertMarkdownSnippet(textareaRef, currentText, onChangeText, '`', '`', 'команда')}
        className="px-2 py-0.5 rounded bg-white hover:bg-zinc-100 border border-editorial-border font-mono text-[10px] cursor-pointer shadow-xs transition-colors"
        title="Инлайн-код (`...`)"
      >
        `code`
      </button>
      <button
        type="button"
        onClick={() => insertMarkdownSnippet(textareaRef, currentText, onChangeText, '```bash\n', '\n```', '# Команда терминала')}
        className="px-2 py-0.5 rounded bg-white hover:bg-zinc-100 border border-editorial-border font-mono text-[10px] cursor-pointer shadow-xs transition-colors"
        title="Блок кода bash"
      >
        ```bash
      </button>

      <span className="text-editorial-border select-none mx-0.5">|</span>

      {/* Фирменные блоки внимания BookStack */}
      <button
        type="button"
        onClick={() => insertMarkdownSnippet(textareaRef, currentText, onChangeText, '> [!NOTE]\n> ', '', 'Ключевая информация')}
        className="px-2 py-0.5 rounded bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 font-semibold text-[10px] cursor-pointer shadow-xs transition-colors"
        title="Блок примечания BookStack [!NOTE]"
      >
        [!NOTE]
      </button>
      <button
        type="button"
        onClick={() => insertMarkdownSnippet(textareaRef, currentText, onChangeText, '> [!TIP]\n> ', '', 'Полезный совет по оптимизации')}
        className="px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold text-[10px] cursor-pointer shadow-xs transition-colors"
        title="Блок совета BookStack [!TIP]"
      >
        [!TIP]
      </button>
      <button
        type="button"
        onClick={() => insertMarkdownSnippet(textareaRef, currentText, onChangeText, '> [!IMPORTANT]\n> ', '', 'Обязательное требование регламента')}
        className="px-2 py-0.5 rounded bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-300 font-semibold text-[10px] cursor-pointer shadow-xs transition-colors"
        title="Блок важности BookStack [!IMPORTANT]"
      >
        [!IMPORTANT]
      </button>
      <button
        type="button"
        onClick={() => insertMarkdownSnippet(textareaRef, currentText, onChangeText, '> [!WARNING]\n> ', '', 'Предупреждение о риске сбоя')}
        className="px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-semibold text-[10px] cursor-pointer shadow-xs transition-colors"
        title="Блок предупреждения BookStack [!WARNING]"
      >
        [!WARNING]
      </button>
      <button
        type="button"
        onClick={() => insertMarkdownSnippet(textareaRef, currentText, onChangeText, '> [!CAUTION]\n> ', '', 'Опасность: риск потери данных')}
        className="px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 font-semibold text-[10px] cursor-pointer shadow-xs transition-colors"
        title="Блок опасности BookStack [!CAUTION]"
      >
        [!CAUTION]
      </button>

      <span className="text-editorial-border select-none mx-0.5">|</span>

      <button
        type="button"
        onClick={() => insertMarkdownSnippet(
          textareaRef,
          currentText,
          onChangeText,
          '| Ошибка / Симптом | Вероятная причина | Шаги устранения |\n|---|---|---|\n| ',
          ' | Причина сбоя | Решение проблемы |',
          'Симптом'
        )}
        className="px-2 py-0.5 rounded bg-white hover:bg-zinc-100 border border-editorial-border text-[10px] font-semibold cursor-pointer shadow-xs transition-colors"
        title="Таблица диагностики"
      >
        Таблица
      </button>
      <button
        type="button"
        onClick={() => insertMarkdownSnippet(textareaRef, currentText, onChangeText, '1. ', '\n2. Шаг 2\n3. Шаг 3', 'Шаг 1')}
        className="px-2 py-0.5 rounded bg-white hover:bg-zinc-100 border border-editorial-border text-[10px] font-semibold cursor-pointer shadow-xs transition-colors"
        title="Нумерованный список"
      >
        1. 2. 3.
      </button>
    </div>
  );

  // Ручная правка заголовка ревизии
  const handleUpdateRefinedTitle = (newTitle: string) => {
    if (!auditResult) return;
    setAuditResult(prev => {
      if (!prev) return null;
      return {
        ...prev,
        refinedTitle: newTitle,
        hasManualEdits: true,
      };
    });
  };

  // Ручная правка текста ревизии (с живым пересчетом дифф-строк и счетчиков)
  const handleUpdateRefinedMarkdown = (newMarkdown: string) => {
    if (!auditResult) return;
    const refinedWordCount = newMarkdown.trim().split(/\s+/).filter(Boolean).length;
    const originalWordCount = originalMarkdown.trim().split(/\s+/).filter(Boolean).length;
    const reduction = originalWordCount > 0 ? Math.round(((originalWordCount - refinedWordCount) / originalWordCount) * 100) : 0;
    
    const diff = computeLcsDiff(originalMarkdown, newMarkdown);
    const addedLines = diff.addedCount;
    const removedLines = diff.removedCount;

    setAuditResult(prev => {
      if (!prev) return null;
      return {
        ...prev,
        refinedMarkdown: newMarkdown,
        hasManualEdits: true,
        stats: {
          originalWords: originalWordCount,
          refinedWords: refinedWordCount,
          reductionPercent: reduction,
          addedLines,
          removedLines,
        }
      };
    });
  };

  // Сброс ручных правок к первоначальной версии ИИ
  const handleResetToAiRefined = () => {
    if (!auditResult || !aiRefinedMarkdownOriginal) return;
    handleUpdateRefinedTitle(aiRefinedTitleOriginal || selectedPageTitle);
    handleUpdateRefinedMarkdown(aiRefinedMarkdownOriginal);
  };

  // --------------------------------------------------------------------------
  // СОХРАНЕНИЕ / ПЕРЕЗАПИСЬ В BOOKSTACK (С ЗАЩИТОЙ)
  // --------------------------------------------------------------------------
  const openRefinedConfirmModal = () => {
    if (!auditResult || !selectedPageId) return;
    setConfirmModalData({
      type: 'refined',
      title: auditResult.refinedTitle,
      markdown: auditResult.refinedMarkdown,
      pageId: selectedPageId,
      hasManualEdits: hasManualRefinedEdits,
      description: auditResult.refinedDescription,
    });
    setConfirmCheckbox(false);
    setIsConfirmModalOpen(true);
  };

  const openDirectManualConfirmModal = () => {
    if (!selectedPageId) return;
    setConfirmModalData({
      type: 'direct_manual',
      title: editedOriginalTitle || selectedPageTitle,
      markdown: editedOriginalMarkdown || originalMarkdown,
      pageId: selectedPageId,
      hasManualEdits: true,
    });
    setConfirmCheckbox(false);
    setIsConfirmModalOpen(true);
  };

  const handleApplyToBookStack = async () => {
    if (!confirmModalData.pageId) return;
    setIsSavingToBookStack(true);

    try {
      const { type, title, markdown, pageId, description, hasManualEdits: isManual } = confirmModalData;

      if (isDemoMode || !credentials.baseUrl) {
        // Демо-сохранение
        await new Promise(r => setTimeout(r, 1200));
        setOriginalMarkdown(markdown);
        setSelectedPageTitle(title);
        setEditedOriginalMarkdown(markdown);
        setEditedOriginalTitle(title);
        setIsConfirmModalOpen(false);
        setConfirmCheckbox(false);
        setPublishStatus({
          type: 'success',
          message: `[Демо-режим] Статья #${pageId} («${title}») успешно сохранена в базе знаний!`,
          url: '#'
        });
        if (onPageUpdated) onPageUpdated(pageId, title);
        return;
      }

      // Реальный вызов BookStack API через прокси
      const tagsToSave = type === 'refined' ? ['Audited-BridgeLM'] : ['Manual-BridgeLM'];
      if (isManual && type === 'refined') {
        tagsToSave.push('User-Refined');
      }
      if (createBackupTag) {
        tagsToSave.push(`rev-${new Date().toISOString().slice(0, 10)}`);
      }

      // Поддержка конвертации Markdown callout блоков в нативный BookStack HTML
      const htmlSafeMarkdown = convertCalloutsToBookStackHtml(markdown);

      const response = await updatePage(
        credentials,
        pageId,
        title,
        htmlSafeMarkdown,
        tagsToSave,
        description
      );

      const pageUrl = response?.url || `${credentials.baseUrl}/books/page/${pageId}`;

      setOriginalMarkdown(markdown);
      setSelectedPageTitle(title);
      setEditedOriginalMarkdown(markdown);
      setEditedOriginalTitle(title);
      setIsConfirmModalOpen(false);
      setConfirmCheckbox(false);
      setPublishStatus({
        type: 'success',
        message: type === 'refined'
          ? (isManual ? 'Статья успешно обновлена в BookStack (ревизия + ручные правки)!' : 'Статья успешно обновлена в BookStack!')
          : 'Статья успешно обновлена в BookStack (прямые ручные правки)!',
        url: pageUrl
      });

      if (onPageUpdated) onPageUpdated(pageId, title);
    } catch (err: any) {
      console.error('Ошибка при обновлении статьи в BookStack:', err);
      setPublishStatus({
        type: 'error',
        message: `Не удалось обновить статью: ${err.message || 'Ошибка сети'}`
      });
    } finally {
      setIsSavingToBookStack(false);
    }
  };

  // Быстрые чипы указаний
  const QUICK_PROMPTS = [
    { label: '✂️ Сократить в 2 раза', prompt: 'Сократи объем текста минимум в 2 раза. Убери вводные рассуждения, оставь только прямые инструкции.' },
    { label: '🛡️ Оформить воркараунд', prompt: 'Добавь четкую секцию "Диагностика и воркараунды при сбоях" в виде таблицы с кодами ошибок.' },
    { label: '🧹 Убрать канцелярит', prompt: 'Примени строгий стиль humanizer-ru: перепиши цепочки существительных глаголами прямого действия.' },
    { label: '💡 Добавить Callouts', prompt: 'Преобразуй важные примечания и предостережения в фирменные блоки BookStack: > [!NOTE], > [!WARNING], > [!TIP].' },
    { label: '📋 Пошаговый регламент', prompt: 'Преврати сплошной текст в нумерованный пошаговый алгоритм с точными командами в блоках кода.' },
  ];

  // Полноценный расчет цветного Diff через алгоритм LCS (Longest Common Subsequence)
  const diffData = useMemo(() => {
    if (!auditResult) {
      return {
        unified: [],
        sideBySide: [],
        addedCount: 0,
        removedCount: 0,
        unchangedCount: 0,
      };
    }
    return computeLcsDiff(originalMarkdown, auditResult.refinedMarkdown);
  }, [originalMarkdown, auditResult?.refinedMarkdown]);

  // Фильтрация строк для двухколоночного (Side-by-Side) цветного Diff
  const visibleSideBySideRows = useMemo(() => {
    if (!diffData.sideBySide) return [];
    if (diffLineFilter === 'all') return diffData.sideBySide;
    return diffData.sideBySide.filter(row => row.isChanged);
  }, [diffData.sideBySide, diffLineFilter]);

  // Фильтрация строк для единого (Inline) цветного Diff
  const visibleUnifiedLines = useMemo(() => {
    if (!diffData.unified) return [];
    if (diffLineFilter === 'all') return diffData.unified;
    return diffData.unified.filter(line => line.type !== 'unchanged');
  }, [diffData.unified, diffLineFilter]);

  // Фильтрованные замечания
  const filteredIssues = useMemo(() => {
    if (!auditResult) return [];
    if (activeIssueFilter === 'all') return auditResult.issues;
    return auditResult.issues.filter(i => i.severity === activeIssueFilter);
  }, [auditResult, activeIssueFilter]);

  // Цвета метрик
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-700 bg-emerald-50 border-emerald-500';
    if (score >= 60) return 'text-amber-700 bg-amber-50 border-amber-500';
    return 'text-rose-700 bg-rose-50 border-rose-500';
  };

  const getScoreBarBg = (score: number) => {
    if (score >= 80) return 'bg-emerald-600';
    if (score >= 60) return 'bg-amber-500';
    return 'bg-rose-600';
  };

  return (
    <div className="w-full space-y-6 lg:space-y-8 font-sans">
      {/* ------------------------------------------------------------------ */}
      {/* 1. ВЕРХНИЙ ИНФО-БАННЕР РАЗДЕЛА                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="editorial-card rounded-lg p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1.5 flex-wrap">
            <span className="p-2 bg-editorial-terracotta-light text-editorial-terracotta rounded-md border border-editorial-border">
              <ShieldCheck size={20} />
            </span>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-editorial-text">Аудит и ревизия статей Базы Знаний BookStack</h1>
            <span className="accent-pill">Wiki Article Refiner & Anti-Slop</span>
          </div>
          <p className="text-xs text-editorial-muted max-w-2xl leading-relaxed">
            Интеллектуальный контроль качества и ревизия статей в базе знаний BookStack: выявление ИИ-слопа и канцелярита, добавление воркараундов и оформление нативных Callouts [!NOTE]/[!WARNING] без изменения тикетов поддержки.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {isDemoMode && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-900 text-[10px] font-semibold uppercase tracking-wider rounded-md">
              <AlertTriangle size={13} className="text-amber-600" />
              Демо-режим
            </div>
          )}
          <button
            onClick={loadKnowledgeBaseTree}
            disabled={isLoadingTree}
            className="flex items-center gap-2 px-3.5 py-2 bg-white border border-editorial-border rounded-md text-xs font-medium text-editorial-text hover:border-editorial-border-dark shadow-xs transition-all cursor-pointer"
            title="Обновить статьи BookStack"
          >
            <RefreshCw size={13} className={isLoadingTree ? 'animate-spin text-editorial-terracotta' : ''} />
            Обновить базу
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2. ОСНОВНАЯ СЕТКА: СЕЛЕКТОР (СЛЕВА) И СТАТЬЯ / АУДИТ (СПРАВА)      */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* ================================================================ */}
        {/* ЛЕВАЯ КОЛОНКА (3-4 колонки): ДРЕВОВИДНЫЙ СЕЛЕКТОР И ПОИСК          */}
        {/* ================================================================ */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-4">
          <div className="editorial-card rounded-lg p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-editorial-border">
              <div className="flex items-center gap-2">
                <BookOpen size={16} className="text-editorial-text" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-editorial-text">Статьи Базы Знаний (Wiki)</h2>
              </div>
              <span className="text-[10px] font-mono text-editorial-muted font-medium">
                {books.length} {books.length === 1 ? 'книга' : 'книг'}
              </span>
            </div>

            {/* Живой поиск */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-editorial-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск статей в Wiki BookStack..."
                className="w-full pl-9 pr-8 py-2 bg-white border border-editorial-border rounded-md text-xs text-editorial-text focus:border-editorial-border-dark focus:outline-none transition-all placeholder:text-editorial-muted/70 font-sans shadow-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-editorial-muted hover:text-editorial-text cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Результаты живого поиска */}
            {searchQuery.trim() !== '' ? (
              <div className="space-y-1.5 max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-editorial-muted px-1">
                  Найдено совпадений: {searchResults.length}
                </div>
                {isSearching ? (
                  <div className="p-4 text-center text-xs text-editorial-muted flex items-center justify-center gap-2">
                    <RefreshCw size={14} className="animate-spin text-editorial-terracotta" /> Поиск в BookStack...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="p-4 text-center text-xs text-editorial-muted italic">
                    Ничего не найдено по запросу «{searchQuery}»
                  </div>
                ) : (
                  searchResults.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleSelectPage(item.id, item.name)}
                      className={`w-full text-left p-2.5 text-xs rounded-md border transition-all flex items-start gap-2 cursor-pointer ${
                        selectedPageId === item.id
                          ? 'bg-editorial-text text-white border-editorial-text font-medium shadow-xs'
                          : 'bg-white border-editorial-border hover:border-editorial-border-dark text-editorial-text'
                      }`}
                    >
                      <FileText size={14} className="mt-0.5 shrink-0 opacity-70" />
                      <div className="truncate flex-1">
                        <div className="truncate font-medium">{item.name}</div>
                        <div className="text-[9px] opacity-60 font-mono">ID: #{item.id}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            ) : (
              /* Иерархическое дерево: Книга -> Глава -> Страница */
              <div className="space-y-1 max-h-[520px] overflow-y-auto custom-scrollbar pr-1">
                {books.map((book) => {
                  const isBookExpanded = !!expandedBooks[book.id];
                  const chapters = chaptersByBook[book.id] || [];
                  const rootPages = rootPagesByBook[book.id] || [];

                  return (
                    <div key={book.id} className="border border-editorial-border/60 rounded-md overflow-hidden">
                      {/* Узел Книги */}
                      <button
                        onClick={() => {
                          const nextState = !isBookExpanded;
                          setExpandedBooks(prev => ({ ...prev, [book.id]: nextState }));
                          if (nextState && !chaptersByBook[book.id]) {
                            loadBookContents(book.id);
                          }
                        }}
                        className="w-full flex items-center justify-between p-2 text-left bg-editorial-bg-alt/60 hover:bg-editorial-bg-alt text-xs font-semibold text-editorial-text transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2 truncate">
                          {isBookExpanded ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
                          <BookOpen size={13} className="text-editorial-muted shrink-0" />
                          <span className="truncate">{book.name}</span>
                        </div>
                        <span className="text-[9px] font-mono text-editorial-muted">#{book.id}</span>
                      </button>

                      {/* Главы и прямые страницы книги */}
                      <AnimatePresence>
                        {isBookExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="pl-3 py-1 space-y-1 bg-white border-t border-editorial-border/40"
                          >
                            {/* Главы */}
                            {chapters.map((chap) => {
                              const isChapExpanded = !!expandedChapters[chap.id];
                              const pages = pagesByChapter[chap.id] || [];

                              return (
                                <div key={chap.id} className="space-y-0.5">
                                  <button
                                    onClick={() => {
                                      const nextChap = !isChapExpanded;
                                      setExpandedChapters(prev => ({ ...prev, [chap.id]: nextChap }));
                                      if (nextChap && !pagesByChapter[chap.id]) {
                                        loadChapterContents(chap.id);
                                      }
                                    }}
                                    className="w-full flex items-center justify-between p-1.5 text-left hover:bg-editorial-bg-alt/70 text-[11px] font-medium text-editorial-text rounded transition-colors cursor-pointer"
                                  >
                                    <div className="flex items-center gap-1.5 truncate">
                                      {isChapExpanded ? <ChevronDown size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />}
                                      <Folder size={12} className="text-amber-600 shrink-0" />
                                      <span className="truncate">{chap.name}</span>
                                    </div>
                                  </button>

                                  {/* Страницы внутри главы */}
                                  {isChapExpanded && (
                                    <div className="pl-3.5 space-y-0.5 border-l border-editorial-border my-0.5">
                                      {isDemoMode && chap.id === 201 ? (
                                        <button
                                          onClick={() => handleSelectDemoPage(301)}
                                          className={`w-full text-left px-2 py-1.5 text-xs rounded transition-all flex items-center justify-between cursor-pointer ${
                                            selectedPageId === 301
                                              ? 'bg-editorial-text text-white font-medium shadow-xs'
                                              : 'hover:bg-editorial-bg-alt text-editorial-text'
                                          }`}
                                        >
                                          <div className="flex items-center gap-1.5 truncate">
                                            <FileText size={11} className="shrink-0 opacity-70" />
                                            <span className="truncate">{DEMO_PAGES[301].title}</span>
                                          </div>
                                          <span className="text-[9px] font-mono opacity-60">#301</span>
                                        </button>
                                      ) : isDemoMode && chap.id === 203 ? (
                                        <button
                                          onClick={() => handleSelectDemoPage(302)}
                                          className={`w-full text-left px-2 py-1.5 text-xs rounded transition-all flex items-center justify-between cursor-pointer ${
                                            selectedPageId === 302
                                              ? 'bg-editorial-text text-white font-medium shadow-xs'
                                              : 'hover:bg-editorial-bg-alt text-editorial-text'
                                          }`}
                                        >
                                          <div className="flex items-center gap-1.5 truncate">
                                            <FileText size={11} className="shrink-0 opacity-70" />
                                            <span className="truncate">{DEMO_PAGES[302].title}</span>
                                          </div>
                                          <span className="text-[9px] font-mono opacity-60">#302</span>
                                        </button>
                                      ) : (
                                        pages.map((p) => (
                                          <button
                                            key={p.id}
                                            onClick={() => handleSelectPage(p.id, p.name)}
                                            className={`w-full text-left px-2 py-1.5 text-xs rounded transition-all flex items-center justify-between cursor-pointer ${
                                              selectedPageId === p.id
                                                ? 'bg-editorial-text text-white font-medium shadow-xs'
                                                : 'hover:bg-editorial-bg-alt text-editorial-text'
                                            }`}
                                          >
                                            <div className="flex items-center gap-1.5 truncate">
                                              <FileText size={11} className="shrink-0 opacity-70" />
                                              <span className="truncate">{p.name}</span>
                                            </div>
                                            <span className="text-[9px] font-mono opacity-60">#{p.id}</span>
                                          </button>
                                        ))
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {/* Прямые страницы книги (без главы) */}
                            {rootPages.map((rp) => (
                              <button
                                key={rp.id}
                                onClick={() => handleSelectPage(rp.id, rp.name)}
                                className={`w-full text-left px-2 py-1.5 text-xs rounded transition-all flex items-center justify-between cursor-pointer ${
                                  selectedPageId === rp.id
                                    ? 'bg-editorial-text text-white font-medium shadow-xs'
                                    : 'hover:bg-editorial-bg-alt text-editorial-text'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <FileText size={11} className="shrink-0 opacity-70" />
                                  <span className="truncate">{rp.name}</span>
                                </div>
                                <span className="text-[9px] font-mono opacity-60">#{rp.id}</span>
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Карточка метаданных текущей выбранной статьи */}
          {selectedPageId && (
            <div className="editorial-card rounded-lg p-4 space-y-2.5 bg-editorial-bg-alt/50 border border-editorial-border shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wider text-editorial-muted">Выбранная статья Wiki</span>
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 bg-white border border-editorial-border rounded">
                  #{selectedPageId}
                </span>
              </div>
              <div className="font-serif text-sm font-bold text-editorial-text leading-snug line-clamp-2">
                {selectedPageTitle}
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-editorial-border/60 text-[10px] font-mono text-editorial-muted">
                <span>Слов: {originalMarkdown.trim().split(/\s+/).filter(Boolean).length}</span>
                <span>•</span>
                <span>Символов: {originalMarkdown.length}</span>
              </div>
              <div className="pt-1 flex flex-col gap-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => {
                      setActiveRightTab('preview');
                      setPreviewMode('rendered');
                    }}
                    className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-xs font-semibold border transition-all cursor-pointer ${
                      activeRightTab === 'preview' && previewMode !== 'edit'
                        ? 'bg-editorial-text text-white border-editorial-text shadow-xs'
                        : 'bg-white text-editorial-text border-editorial-border hover:bg-editorial-bg-alt shadow-xs'
                    }`}
                  >
                    <Eye size={12} />
                    Просмотр
                  </button>
                  <button
                    onClick={() => {
                      setActiveRightTab('preview');
                      setPreviewMode('edit');
                    }}
                    className={`flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-xs font-semibold border transition-all cursor-pointer ${
                      activeRightTab === 'preview' && previewMode === 'edit'
                        ? 'bg-emerald-700 text-white border-emerald-800 shadow-xs'
                        : 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100 shadow-xs'
                    }`}
                  >
                    <Edit3 size={12} />
                    Правка
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setActiveRightTab('settings')}
                    className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-[11px] font-medium border transition-all cursor-pointer ${
                      activeRightTab === 'settings'
                        ? 'bg-editorial-text text-white border-editorial-text'
                        : 'bg-white text-editorial-muted hover:text-editorial-text border-editorial-border'
                    }`}
                  >
                    <SlidersHorizontal size={11} />
                    Параметры
                  </button>
                  {auditResult && (
                    <button
                      onClick={() => setActiveRightTab('results')}
                      className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-[11px] font-medium border transition-all cursor-pointer ${
                        activeRightTab === 'results'
                          ? 'bg-editorial-text text-white border-editorial-text'
                          : 'bg-white text-emerald-700 hover:text-emerald-900 border-emerald-300'
                      }`}
                    >
                      <Sparkles size={11} />
                      Diff
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ================================================================ */}
        {/* ПРАВАЯ КОЛОНКА (8-9 колонок): АУДИТ, SCORECARD, DIFF И УПРАВЛЕНИЕ */}
        {/* ================================================================ */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-6 lg:space-y-8">
          {/* Навигационные вкладки правой панели */}
          <div className="editorial-card rounded-lg p-2 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setActiveRightTab('preview')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeRightTab === 'preview'
                    ? 'bg-editorial-text text-white shadow-xs'
                    : 'bg-editorial-bg-alt/80 text-editorial-text hover:bg-editorial-bg-alt border border-editorial-border'
                }`}
              >
                <Eye size={14} className={activeRightTab === 'preview' ? 'text-amber-200' : 'text-editorial-muted'} />
                <span>Предпросмотр статьи Wiki</span>
                {selectedPageId && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    activeRightTab === 'preview' ? 'bg-zinc-800 text-zinc-300' : 'bg-white text-editorial-muted border border-editorial-border'
                  }`}>
                    #{selectedPageId}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveRightTab('settings')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  activeRightTab === 'settings'
                    ? 'bg-editorial-text text-white shadow-xs'
                    : 'bg-editorial-bg-alt/80 text-editorial-text hover:bg-editorial-bg-alt border border-editorial-border'
                }`}
              >
                <SlidersHorizontal size={14} className={activeRightTab === 'settings' ? 'text-amber-200' : 'text-editorial-muted'} />
                <span>Параметры ревизии</span>
              </button>

              {auditResult && (
                <button
                  onClick={() => setActiveRightTab('results')}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    activeRightTab === 'results'
                      ? 'bg-editorial-text text-white shadow-xs'
                      : 'bg-editorial-bg-alt/80 text-editorial-text hover:bg-editorial-bg-alt border border-editorial-border'
                  }`}
                >
                  <Sparkles size={14} className={activeRightTab === 'results' ? 'text-amber-300' : 'text-emerald-600'} />
                  <span>Результаты аудита и Diff</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded font-bold">
                    {auditResult.scorecard.overallScore}/100
                  </span>
                </button>
              )}
            </div>

            {/* Быстрый запуск ревизии */}
            {selectedPageId && (
              <button
                onClick={runArticleAuditAndRefine}
                disabled={isAuditing}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer shadow-xs ${
                  isAuditing
                    ? 'bg-zinc-200 text-zinc-400 border border-zinc-300 cursor-not-allowed'
                    : 'bg-editorial-terracotta hover:bg-editorial-terracotta-hover text-white border border-editorial-terracotta active:translate-y-px'
                }`}
              >
                {isAuditing ? (
                  <>
                    <RefreshCw size={13} className="animate-spin text-white" />
                    <span>{auditProgressStage || 'Анализ...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={13} className="text-amber-200" />
                    <span>Запустить ревизию</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Статус публикации */}
          {publishStatus.type !== 'idle' && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-lg border flex items-center justify-between gap-4 shadow-xs ${
                publishStatus.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-rose-50 border-rose-300 text-rose-950'
              }`}
            >
              <div className="flex items-center gap-3">
                {publishStatus.type === 'success' ? (
                  <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                ) : (
                  <XCircle size={20} className="text-rose-600 shrink-0" />
                )}
                <div className="text-xs font-semibold">{publishStatus.message}</div>
              </div>
              {publishStatus.url && publishStatus.url !== '#' && (
                <a
                  href={publishStatus.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1 bg-white border border-emerald-600 text-emerald-800 text-[10px] font-bold uppercase tracking-wider rounded-md hover:bg-emerald-50 shadow-xs"
                >
                  Открыть в BookStack <ExternalLink size={12} />
                </a>
              )}
            </motion.div>
          )}

          {/* ================================================================ */}
          {/* ВКЛАДКА 1: ПРЕДПРОСМОТР ВЫБРАННОЙ СТАТЬИ WIKI                     */}
          {/* ================================================================ */}
          {activeRightTab === 'preview' && (
            <div className="editorial-card rounded-lg p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-editorial-border">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-sky-50 text-sky-800 border border-sky-200">
                      Оригинал из Базы Знаний BookStack
                    </span>
                    {selectedPageId && (
                      <span className="text-[10px] font-mono text-editorial-muted">ID: #{selectedPageId}</span>
                    )}
                  </div>
                  <h2 className="font-serif text-xl sm:text-2xl font-bold text-editorial-text">
                    {selectedPageTitle || 'Статья не выбрана'}
                  </h2>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Переключатель режима: Форматирование / Markdown / Редактор */}
                  <div className="flex p-0.5 bg-editorial-bg-alt border border-editorial-border rounded-md shadow-xs">
                    <button
                      onClick={() => setPreviewMode('rendered')}
                      className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer ${
                        previewMode === 'rendered' ? 'bg-white text-editorial-text shadow-xs font-semibold' : 'text-editorial-muted hover:text-editorial-text'
                      }`}
                    >
                      Форматирование
                    </button>
                    <button
                      onClick={() => setPreviewMode('raw')}
                      className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer ${
                        previewMode === 'raw' ? 'bg-white text-editorial-text shadow-xs font-semibold' : 'text-editorial-muted hover:text-editorial-text'
                      }`}
                    >
                      Markdown
                    </button>
                    <button
                      onClick={() => setPreviewMode('edit')}
                      className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer flex items-center gap-1 ${
                        previewMode === 'edit'
                          ? 'bg-emerald-700 text-white shadow-xs font-semibold'
                          : 'text-emerald-800 hover:text-emerald-950 hover:bg-emerald-50'
                      }`}
                    >
                      <Edit3 size={11} />
                      Редактор
                    </button>
                  </div>

                  {/* Копировать Markdown */}
                  {originalMarkdown && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(previewMode === 'edit' ? editedOriginalMarkdown : originalMarkdown);
                        setCopiedOriginal(true);
                        setTimeout(() => setCopiedOriginal(false), 2000);
                      }}
                      className="p-1.5 bg-white border border-editorial-border hover:bg-editorial-bg-alt rounded-md text-editorial-muted hover:text-editorial-text transition-all cursor-pointer shadow-xs"
                      title="Скопировать Markdown статьи"
                    >
                      {copiedOriginal ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    </button>
                  )}
                </div>
              </div>

              {/* Содержимое статьи */}
              {isLoadingPage ? (
                <div className="p-12 text-center text-xs text-editorial-muted flex flex-col items-center justify-center gap-3">
                  <RefreshCw size={24} className="animate-spin text-editorial-terracotta" />
                  <span>Загрузка содержимого статьи из BookStack...</span>
                </div>
              ) : !selectedPageId ? (
                <div className="p-12 text-center text-xs text-editorial-muted italic">
                  Выберите статью в селекторе слева для предварительного просмотра.
                </div>
              ) : previewMode === 'edit' ? (
                /* РЕЖИМ РУЧНОГО РЕДАКТОРА СТАТЬИ */
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-editorial-muted block">
                      Название статьи в BookStack
                    </label>
                    <input
                      type="text"
                      value={editedOriginalTitle}
                      onChange={(e) => setEditedOriginalTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-editorial-border rounded-md text-sm font-serif font-bold text-editorial-text focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-xs"
                      placeholder="Заголовок статьи..."
                    />
                  </div>

                  <div className="border border-editorial-border rounded-lg overflow-hidden bg-white shadow-xs">
                    {renderEditorToolbar(originalTextareaRef, editedOriginalMarkdown, setEditedOriginalMarkdown)}
                    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-editorial-border">
                      {/* Левая колонка: Textarea */}
                      <div className="flex flex-col bg-white">
                        <div className="px-3 py-1.5 bg-editorial-bg-alt/60 border-b border-editorial-border text-[10px] font-mono text-editorial-muted flex justify-between items-center">
                          <span>Редактор Markdown статьи</span>
                          <span>{editedOriginalMarkdown.length} симв. • {editedOriginalMarkdown.trim().split(/\s+/).filter(Boolean).length} слов</span>
                        </div>
                        <textarea
                          ref={originalTextareaRef}
                          value={editedOriginalMarkdown}
                          onChange={(e) => setEditedOriginalMarkdown(e.target.value)}
                          rows={16}
                          className="w-full p-4 font-mono text-xs leading-relaxed text-editorial-text bg-[#FAF9F6] resize-y focus:outline-none focus:ring-0 custom-scrollbar min-h-[380px]"
                          placeholder="Введите текст статьи в формате Markdown..."
                        />
                      </div>

                      {/* Правая колонка: Live Preview */}
                      <div className="flex flex-col bg-white">
                        <div className="px-3 py-1.5 bg-editorial-bg-alt/60 border-b border-editorial-border text-[10px] font-mono text-emerald-800 font-semibold flex justify-between items-center">
                          <span>Живой предпросмотр оформления</span>
                          <span className="text-[9px] bg-emerald-100 text-emerald-900 px-1.5 py-0.2 rounded font-mono">AEMarkdown</span>
                        </div>
                        <div className="p-4 overflow-y-auto custom-scrollbar max-h-[500px] min-h-[380px] prose prose-stone prose-sm max-w-none font-sans text-xs leading-relaxed text-editorial-text">
                          {editedOriginalMarkdown ? (
                            <AEMarkdown>{editedOriginalMarkdown}</AEMarkdown>
                          ) : (
                            <div className="text-editorial-muted italic text-center p-8">Текст статьи пуст</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : !originalMarkdown ? (
                <div className="p-8 text-center text-xs text-editorial-muted italic">
                  Содержимое статьи пусто или не загружено.
                </div>
              ) : previewMode === 'rendered' ? (
                <div className="prose prose-stone prose-sm max-w-none font-sans text-xs leading-relaxed text-editorial-text bg-white p-5 sm:p-6 rounded-lg border border-editorial-border/60">
                  <AEMarkdown>{originalMarkdown}</AEMarkdown>
                </div>
              ) : (
                <pre className="p-4 bg-[#FAF9F6] border border-editorial-border rounded-lg font-mono text-[11px] leading-relaxed text-editorial-text overflow-x-auto whitespace-pre-wrap">
                  {originalMarkdown}
                </pre>
              )}

              {/* Подвал карточки предпросмотра */}
              {previewMode === 'edit' ? (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-editorial-border">
                  <div className="text-[11px] text-editorial-muted">
                    Внесенные ручные правки можно сохранить в BookStack напрямую или передать в ИИ-аудит.
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setEditedOriginalTitle(selectedPageTitle);
                        setEditedOriginalMarkdown(originalMarkdown);
                        setPreviewMode('rendered');
                      }}
                      className="px-3.5 py-1.5 bg-white border border-editorial-border hover:bg-editorial-bg-alt rounded-md text-xs font-semibold text-editorial-muted hover:text-editorial-text transition-all cursor-pointer shadow-xs"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOriginalMarkdown(editedOriginalMarkdown);
                        setSelectedPageTitle(editedOriginalTitle);
                        runArticleAuditAndRefine();
                      }}
                      disabled={isAuditing}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-editorial-text hover:bg-zinc-800 text-white rounded-md text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer shadow-xs"
                    >
                      <Sparkles size={12} className="text-amber-200" />
                      Аудит с учетом правок
                    </button>
                    <button
                      type="button"
                      onClick={openDirectManualConfirmModal}
                      className="flex items-center gap-1.5 px-5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer shadow-xs active:translate-y-px"
                    >
                      <Save size={13} />
                      Сохранить в BookStack напрямую
                    </button>
                  </div>
                </div>
              ) : selectedPageId && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-editorial-border">
                  <div className="text-[11px] text-editorial-muted">
                    Объем статьи: <strong>{originalMarkdown.trim().split(/\s+/).filter(Boolean).length} слов</strong> • {originalMarkdown.length} символов
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreviewMode('edit')}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-editorial-border hover:bg-emerald-50 rounded-md text-xs font-semibold text-emerald-900 transition-all cursor-pointer shadow-xs"
                    >
                      <Edit3 size={13} />
                      Редактировать статью
                    </button>
                    <button
                      onClick={() => setActiveRightTab('settings')}
                      className="px-3.5 py-1.5 bg-white border border-editorial-border hover:bg-editorial-bg-alt rounded-md text-xs font-semibold text-editorial-text transition-all cursor-pointer shadow-xs"
                    >
                      Параметры и скиллы
                    </button>
                    <button
                      onClick={runArticleAuditAndRefine}
                      disabled={isAuditing}
                      className="flex items-center gap-2 px-5 py-1.5 bg-editorial-terracotta hover:bg-editorial-terracotta-hover text-white rounded-md text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer shadow-xs active:translate-y-px"
                    >
                      <Sparkles size={13} className="text-amber-200" />
                      Запустить аудит статьи
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================ */}
          {/* ВКЛАДКА 2: ПАРАМЕТРЫ РЕВИЗИИ И СКИЛЛЫ                             */}
          {/* ================================================================ */}
          {activeRightTab === 'settings' && (
            <div className="editorial-card rounded-lg p-5 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-editorial-border">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={16} className="text-editorial-text" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-editorial-text">
                    Параметры ревизии статьи Wiki
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-editorial-muted">Модель:</span>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value as GeminiModelId)}
                    className="px-2.5 py-1.5 bg-editorial-bg-alt border border-editorial-border rounded-md text-xs font-semibold text-editorial-text focus:outline-none cursor-pointer shadow-xs"
                  >
                    {GEMINI_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Тогглы скиллов */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-editorial-muted block mb-2">
                  Активные редакторские компетенции
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {[
                    { id: 'no-ai-slop', label: 'no-ai-slop', desc: 'Удаление штампов и пустых преамбул' },
                    { id: 'humanizer-ru', label: 'humanizer-ru', desc: 'Факт-замок, чистка канцелярита' },
                    { id: 'kb-article', label: 'kb-article', desc: 'Стандарты симптомов и воркараундов' },
                    { id: 'wiki-architect', label: 'wiki-architect', desc: 'Перелинковка и BookStack Callouts' },
                    { id: 'simplify-code', label: 'simplify-code', desc: 'Оптимизация конфигов и bash-скриптов' },
                  ].map((skill) => {
                    const active = !!activeSkills[skill.id];
                    return (
                      <button
                        key={skill.id}
                        type="button"
                        onClick={() => setActiveSkills(prev => ({ ...prev, [skill.id]: !prev[skill.id] }))}
                        className={`p-3 rounded-lg text-left border transition-all flex flex-col justify-between gap-1.5 cursor-pointer ${
                          active
                            ? 'bg-editorial-text text-white border-editorial-text shadow-xs'
                            : 'bg-editorial-bg-alt/60 text-editorial-text border-editorial-border hover:border-editorial-border-dark'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-mono font-semibold tracking-tight">{skill.label}</span>
                          <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border ${active ? 'bg-white text-editorial-text border-white' : 'border-editorial-muted/40'}`}>
                            {active && <Check size={10} />}
                          </div>
                        </div>
                        <span className={`text-[9.5px] leading-tight line-clamp-2 ${active ? 'text-zinc-300' : 'text-editorial-muted'}`}>
                          {skill.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Быстрые чипы-указания */}
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-editorial-muted block mb-2">
                  Быстрые цели ревизии
                </label>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((qp, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setCustomInstructions(prev => prev ? `${prev}\n${qp.prompt}` : qp.prompt);
                      }}
                      className="px-3 py-1 bg-editorial-bg-alt hover:bg-white text-editorial-text border border-editorial-border hover:border-editorial-border-dark rounded-full text-xs font-medium transition-all shadow-xs cursor-pointer"
                    >
                      {qp.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Поле дополнительных свободных указаний */}
              <div>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="Дополнительные указания для Gemini (например: 'Оформить регламент в виде таблицы с кодами 502/504', 'Сократить вводную часть')..."
                  rows={2}
                  className="w-full p-3 bg-white border border-editorial-border rounded-md text-xs text-editorial-text focus:border-editorial-border-dark focus:outline-none transition-all placeholder:text-editorial-muted font-sans resize-none shadow-xs"
                />
              </div>

              {/* Кнопка запуска аудита */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                <div className="text-xs text-editorial-muted">
                  {selectedPageId ? (
                    <span>Выбрана страница Wiki: <strong className="text-editorial-text">«{selectedPageTitle}»</strong></span>
                  ) : (
                    <span className="text-editorial-terracotta font-medium">Выберите страницу в селекторе слева</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {selectedPageId && (
                    <button
                      type="button"
                      onClick={() => setActiveRightTab('preview')}
                      className="px-4 py-2 bg-white border border-editorial-border hover:bg-editorial-bg-alt text-editorial-text rounded-md text-xs font-semibold shadow-xs transition-all cursor-pointer"
                    >
                      Посмотреть статью
                    </button>
                  )}
                  <button
                    onClick={runArticleAuditAndRefine}
                    disabled={!selectedPageId || isAuditing}
                    className={`flex items-center gap-2 px-6 py-2 rounded-md text-xs uppercase tracking-wider font-semibold shadow-xs transition-all cursor-pointer active:translate-y-px ${
                      !selectedPageId || isAuditing
                        ? 'bg-zinc-200 text-zinc-400 border border-zinc-300 cursor-not-allowed shadow-none'
                        : 'bg-editorial-terracotta hover:bg-editorial-terracotta-hover text-white border border-editorial-terracotta'
                    }`}
                  >
                    {isAuditing ? (
                      <>
                        <RefreshCw size={14} className="animate-spin text-white" />
                        {auditProgressStage || 'Анализ...'}
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} className="text-amber-200" />
                        Запустить аудит и ревизию
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================ */}
          {/* ВКЛАДКА 3: РЕЗУЛЬТАТЫ АУДИТА, ЖУРНАЛ И DIFF                       */}
          {/* ================================================================ */}
          {activeRightTab === 'results' && !auditResult && (
            <div className="editorial-card rounded-lg p-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-editorial-bg-alt flex items-center justify-center mx-auto text-editorial-muted border border-editorial-border">
                <Sparkles size={22} className="text-amber-500" />
              </div>
              <h3 className="font-serif text-lg font-bold text-editorial-text">Ревизия статьи еще не запускалась</h3>
              <p className="text-xs text-editorial-muted max-w-md mx-auto">
                Выберите статью в селекторе слева и запустите аудит, чтобы получить расчет метрик качества, журнал внесенных правок и цветной Diff.
              </p>
              {selectedPageId && (
                <button
                  onClick={runArticleAuditAndRefine}
                  disabled={isAuditing}
                  className="px-5 py-2 bg-editorial-terracotta hover:bg-editorial-terracotta-hover text-white rounded-md text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer shadow-xs"
                >
                  Запустить аудит статьи
                </button>
              )}
            </div>
          )}

          {/* Панель аудита качества (Quality Scorecard) */}
          {activeRightTab === 'results' && auditResult && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="editorial-card rounded-lg p-5 sm:p-6 space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-editorial-border">
                <div className="flex items-center gap-3.5">
                  <div className={`px-3.5 py-2 rounded-md border text-xl font-mono font-bold shadow-xs ${getScoreColor(auditResult.scorecard.overallScore)}`}>
                    {auditResult.scorecard.overallScore}/100
                  </div>
                  <div>
                    <h3 className="font-serif text-lg font-bold text-editorial-text">Оценка качества статьи</h3>
                    <p className="text-[11px] text-editorial-muted font-sans">
                      {auditResult.scorecard.overallScore >= 80 ? 'Отличное состояние статьи' : 'Требуется ревизия и очистка от ИИ-артефактов'}
                    </p>
                  </div>
                </div>

                {auditResult.stats && (
                  <div className="flex items-center gap-3 text-xs font-mono bg-editorial-bg-alt/70 p-2.5 rounded-md border border-editorial-border">
                    <div>
                      <span className="text-editorial-muted">Сжатие: </span>
                      <strong className={auditResult.stats.reductionPercent > 0 ? 'text-emerald-700' : 'text-editorial-text'}>
                        {auditResult.stats.reductionPercent > 0 ? `-${auditResult.stats.reductionPercent}%` : `${auditResult.stats.reductionPercent}%`}
                      </strong>
                    </div>
                    <span className="opacity-30">•</span>
                    <div className="text-emerald-700 font-bold">+{auditResult.stats.addedLines} строк</div>
                    <span className="opacity-30">•</span>
                    <div className="text-rose-700 font-bold">-{auditResult.stats.removedLines} строк</div>
                  </div>
                )}
              </div>

              {/* 4 Прогресс-бара метрик */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Метрика 1: Человечность */}
                <div className="p-3.5 bg-editorial-bg-alt/60 rounded-md border border-editorial-border space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-editorial-text">Человечность (Humanity)</span>
                    <span className="font-mono font-bold text-editorial-text">{auditResult.scorecard.humanityScore}%</span>
                  </div>
                  <div className="w-full bg-zinc-200/80 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getScoreBarBg(auditResult.scorecard.humanityScore)} transition-all duration-500 rounded-full`}
                      style={{ width: `${auditResult.scorecard.humanityScore}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-editorial-muted">Живой русский язык, глаголы действия, факт-замок.</p>
                </div>

                {/* Метрика 2: Отсутствие штампов */}
                <div className="p-3.5 bg-editorial-bg-alt/60 rounded-md border border-editorial-border space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-editorial-text">Отсутствие штампов (No-Slop)</span>
                    <span className="font-mono font-bold text-editorial-text">{auditResult.scorecard.antiSlopScore}%</span>
                  </div>
                  <div className="w-full bg-zinc-200/80 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getScoreBarBg(auditResult.scorecard.antiSlopScore)} transition-all duration-500 rounded-full`}
                      style={{ width: `${auditResult.scorecard.antiSlopScore}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-editorial-muted">Без пустых преамбул, банальностей и стоп-слов.</p>
                </div>

                {/* Метрика 3: Структура KB */}
                <div className="p-3.5 bg-editorial-bg-alt/60 rounded-md border border-editorial-border space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-editorial-text">Структура KB</span>
                    <span className="font-mono font-bold text-editorial-text">{auditResult.scorecard.structureScore}%</span>
                  </div>
                  <div className="w-full bg-zinc-200/80 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getScoreBarBg(auditResult.scorecard.structureScore)} transition-all duration-500 rounded-full`}
                      style={{ width: `${auditResult.scorecard.structureScore}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-editorial-muted">Симптомы, решение, воркараунд, четкие разделы.</p>
                </div>

                {/* Метрика 4: Форматирование */}
                <div className="p-3.5 bg-editorial-bg-alt/60 rounded-md border border-editorial-border space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-editorial-text">Форматирование BookStack</span>
                    <span className="font-mono font-bold text-editorial-text">{auditResult.scorecard.formattingScore}%</span>
                  </div>
                  <div className="w-full bg-zinc-200/80 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getScoreBarBg(auditResult.scorecard.formattingScore)} transition-all duration-500 rounded-full`}
                      style={{ width: `${auditResult.scorecard.formattingScore}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-editorial-muted">Callouts [!NOTE]/[!WARNING], таблицы, подсветка кода.</p>
                </div>
              </div>

              {/* Список найденных замечаний */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-editorial-text">
                    Найденные замечания ({filteredIssues.length})
                  </h4>
                  <div className="flex gap-1 bg-editorial-bg-alt p-0.5 rounded-md border border-editorial-border">
                    {(['all', 'critical', 'warning', 'info'] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setActiveIssueFilter(filter)}
                        className={`px-2.5 py-1 text-[10px] uppercase font-semibold rounded transition-all cursor-pointer ${
                          activeIssueFilter === filter
                            ? 'bg-editorial-text text-white shadow-xs'
                            : 'text-editorial-muted hover:text-editorial-text'
                        }`}
                      >
                        {filter === 'all' ? 'Все' : filter === 'critical' ? 'Критичные' : filter === 'warning' ? 'Важные' : 'Инфо'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
                  {filteredIssues.map((issue) => (
                    <div
                      key={issue.id}
                      className={`p-3.5 rounded-lg border text-xs space-y-2 shadow-xs ${
                        issue.severity === 'critical'
                          ? 'bg-rose-50/60 border-rose-200'
                          : issue.severity === 'warning'
                          ? 'bg-amber-50/60 border-amber-200'
                          : 'bg-blue-50/60 border-blue-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded ${
                            issue.severity === 'critical'
                              ? 'bg-rose-600 text-white'
                              : issue.severity === 'warning'
                              ? 'bg-amber-600 text-white'
                              : 'bg-blue-600 text-white'
                          }`}>
                            {issue.severity}
                          </span>
                          <span className="font-semibold text-editorial-text">{issue.title}</span>
                        </div>
                        <span className="text-[10px] font-mono text-editorial-muted">{issue.rule}</span>
                      </div>

                      {issue.originalSnippet && (
                        <div className="p-2.5 bg-white rounded border border-rose-200/60 font-mono text-[11px] text-rose-800 line-through">
                          {issue.originalSnippet}
                        </div>
                      )}

                      <div className="p-2.5 bg-emerald-50 rounded border border-emerald-200 font-sans text-[11px] text-emerald-950">
                        <strong>Исправление:</strong> {issue.suggestion}
                      </div>

                      <div className="text-[10.5px] text-editorial-muted italic">
                        {issue.explanation}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ================================================================ */}
          {/* СВОДКА ВНЕСЕННЫХ ИЗМЕНЕНИЙ (CHANGELOG & REDACTOR THOUGHTS)        */}
          {/* ================================================================ */}
          {activeRightTab === 'results' && auditResult && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="editorial-card rounded-lg p-5 sm:p-6 space-y-4 border-l-4 border-editorial-terracotta"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-editorial-border">
                <div className="flex items-center gap-2.5">
                  <FileCheck size={18} className="text-editorial-terracotta" />
                  <div>
                    <h3 className="font-serif text-base sm:text-lg font-bold text-editorial-text">
                      Сводка внесенных изменений (Журнал ревизии статьи)
                    </h3>
                    <p className="text-[11px] text-editorial-muted">
                      Ключевые модификации статьи: вырезанный слоп, очищенный канцелярит и добавленные регламенты
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded bg-rose-50 text-rose-800 border border-rose-200 flex items-center gap-1">
                    <Minus size={11} className="text-rose-600" />
                    Удалено: {auditResult.stats?.removedLines ?? 0} строк
                  </span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                    <Plus size={11} className="text-emerald-600" />
                    Добавлено: {auditResult.stats?.addedLines ?? 0} строк
                  </span>
                </div>
              </div>

              {/* Общий комментарий редактора / резюме */}
              <div className="p-3.5 bg-editorial-bg-alt/70 rounded-md border border-editorial-border text-xs text-editorial-text leading-relaxed font-sans flex items-start gap-2.5">
                <Sparkles size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold text-editorial-text">Резюме ревизии: </strong>
                  {auditResult.summary}
                </div>
              </div>

              {/* Уведомление о наличии ручных правок оператора */}
              {hasManualRefinedEdits && (
                <div className="p-3.5 bg-amber-50/90 border border-amber-300 rounded-md text-xs text-amber-950 flex items-start gap-2.5 shadow-xs">
                  <Edit3 size={16} className="text-amber-700 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <strong className="font-semibold text-amber-900">✍️ В статью внесены пользовательские ручные правки</strong>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded border border-amber-300">
                        Ручная редакция
                      </span>
                    </div>
                    <div className="text-[11px] text-amber-900/90 leading-relaxed">
                      Текст или заголовок статьи были скорректированы вручную. Ваши правки учитываются в Diff ниже и именно они будут отправлены в BookStack при сохранении.
                    </div>
                  </div>
                </div>
              )}

              {/* Карточки правок: Выделение старого (красным) и нового (зеленым) */}
              <div className="space-y-3 pt-1">
                {(auditResult.changesSummary && auditResult.changesSummary.length > 0
                  ? auditResult.changesSummary
                  : generateChangesFromIssues(auditResult.issues)
                ).map((ch, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-lg border text-xs space-y-2 shadow-xs transition-all ${
                      ch.type === 'removed'
                        ? 'bg-rose-50/60 border-rose-200/90'
                        : ch.type === 'added'
                        ? 'bg-emerald-50/60 border-emerald-200/90'
                        : 'bg-amber-50/60 border-amber-200/90'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border ${
                          ch.type === 'removed'
                            ? 'bg-rose-100 text-rose-900 border-rose-300'
                            : ch.type === 'added'
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                            : 'bg-amber-100 text-amber-900 border-amber-300'
                        }`}>
                          {ch.type === 'removed' ? '🔴 Удалено (Старое)' : ch.type === 'added' ? '🟢 Добавлено (Новое)' : '🟡 Заменено (Редакция)'}
                        </span>
                        <span className="font-bold text-editorial-text text-[12px]">{ch.title}</span>
                      </div>
                      {ch.category && (
                        <span className="text-[10px] font-mono text-editorial-muted uppercase bg-white/70 px-1.5 py-0.5 rounded border border-editorial-border/40">
                          {ch.category}
                        </span>
                      )}
                    </div>

                    <p className="text-editorial-text/90 text-[11.5px] leading-relaxed">
                      {ch.description}
                    </p>

                    {/* Старый фрагмент (красный фон, зачеркнут) */}
                    {ch.oldSnippet && (
                      <div className="p-2.5 bg-white rounded border border-rose-200 font-mono text-[11px] text-rose-950 leading-snug">
                        <div className="text-[9px] uppercase font-bold text-rose-700 select-none mb-1 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                          Старый фрагмент (удалено/слоп):
                        </div>
                        <div className="line-through decoration-rose-400 bg-rose-50 px-2 py-1 rounded">
                          {ch.oldSnippet}
                        </div>
                      </div>
                    )}

                    {/* Новый фрагмент (зеленый фон) */}
                    {ch.newSnippet && (
                      <div className="p-2.5 bg-white rounded border border-emerald-200 font-mono text-[11px] text-emerald-950 leading-snug">
                        <div className="text-[9px] uppercase font-bold text-emerald-700 select-none mb-1 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Новый фрагмент (ревизия / стандарт KB):
                        </div>
                        <div className="bg-emerald-50 px-2 py-1 rounded font-medium whitespace-pre-wrap">
                          {ch.newSnippet}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ================================================================ */}
          {/* ВИЗУАЛЬНЫЙ DIFF-ПРОСМОТРЩИК (ПОЛНОЦВЕТНЫЙ И АДАПТИВНЫЙ)         */}
          {/* ================================================================ */}
          {activeRightTab === 'results' && auditResult && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="editorial-card rounded-lg space-y-0 overflow-hidden"
            >
              {/* Панель инструментов Diff */}
              <div className="p-3.5 sm:p-4 bg-editorial-bg-alt/80 border-b border-editorial-border flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <SplitSquareHorizontal size={17} className="text-editorial-text" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-editorial-text">
                    Сравнение ревизий статьи Wiki (Diff View)
                  </h3>

                  {/* Бейджи количества изменений */}
                  <div className="flex items-center gap-1.5 ml-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-100 text-rose-900 border border-rose-200 shadow-2xs">
                      -{diffData.removedCount}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-900 border border-emerald-200 shadow-2xs">
                      +{diffData.addedCount}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-zinc-100 text-zinc-700 border border-zinc-200 shadow-2xs">
                      {diffData.unchangedCount} без изм.
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  {/* Переключатель фильтра строк: Все / Только Diff */}
                  {(diffViewMode === 'side-by-side' || diffViewMode === 'inline') && (
                    <div className="flex p-0.5 bg-white border border-editorial-border rounded-md shadow-xs">
                      <button
                        type="button"
                        onClick={() => setDiffLineFilter('all')}
                        className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer ${
                          diffLineFilter === 'all'
                            ? 'bg-editorial-text text-white shadow-xs'
                            : 'text-editorial-muted hover:text-editorial-text'
                        }`}
                        title="Показать все строки статьи с подсветкой изменений"
                      >
                        Все строки ({diffData.unified.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiffLineFilter('changed')}
                        className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer ${
                          diffLineFilter === 'changed'
                            ? 'bg-editorial-text text-white shadow-xs'
                            : 'text-editorial-muted hover:text-editorial-text'
                        }`}
                        title="Показать только добавленные и удаленные строки"
                      >
                        Только Diff ({diffData.addedCount + diffData.removedCount})
                      </button>
                    </div>
                  )}

                  {/* Основной переключатель режимов Diff */}
                  <div className="flex p-0.5 bg-white border border-editorial-border rounded-md shadow-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setDiffViewMode('side-by-side');
                        setIsManualEditingRefined(false);
                      }}
                      className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer flex items-center gap-1.5 ${
                        diffViewMode === 'side-by-side' && !isManualEditingRefined
                          ? 'bg-editorial-text text-white shadow-xs'
                          : 'text-editorial-muted hover:text-editorial-text'
                      }`}
                      title="Цветное двухколоночное сравнение ревизий (красный / зеленый)"
                    >
                      <SplitSquareHorizontal size={12} />
                      Side-by-Side
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDiffViewMode('inline');
                        setIsManualEditingRefined(false);
                      }}
                      className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer flex items-center gap-1.5 ${
                        diffViewMode === 'inline' && !isManualEditingRefined
                          ? 'bg-editorial-text text-white shadow-xs'
                          : 'text-editorial-muted hover:text-editorial-text'
                      }`}
                      title="Цветной единый diff (Git Unified Style)"
                    >
                      <FileCode size={12} />
                      Inline
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDiffViewMode('rendered');
                        setIsManualEditingRefined(false);
                      }}
                      className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer flex items-center gap-1.5 ${
                        diffViewMode === 'rendered' && !isManualEditingRefined
                          ? 'bg-editorial-text text-white shadow-xs'
                          : 'text-editorial-muted hover:text-editorial-text'
                      }`}
                      title="Визуальное форматирование Markdown (Callouts, таблицы, списки)"
                    >
                      <Eye size={12} />
                      Верстка
                    </button>
                  </div>

                  {/* Кнопка включения ручного редактирования ревизии */}
                  <button
                    type="button"
                    onClick={() => {
                      const nextState = !isManualEditingRefined;
                      setIsManualEditingRefined(nextState);
                      if (nextState) {
                        setDiffViewMode('manual-edit');
                      } else {
                        setDiffViewMode('side-by-side');
                      }
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md border transition-all cursor-pointer shadow-xs ${
                      isManualEditingRefined || diffViewMode === 'manual-edit'
                        ? 'bg-amber-600 border-amber-700 text-white shadow-xs'
                        : hasManualRefinedEdits
                        ? 'bg-amber-50 border-amber-400 text-amber-900 hover:bg-amber-100'
                        : 'bg-white border-editorial-border text-editorial-text hover:bg-editorial-bg-alt'
                    }`}
                  >
                    <Edit3 size={11} className={isManualEditingRefined || diffViewMode === 'manual-edit' ? 'text-white' : 'text-amber-600'} />
                    <span>{isManualEditingRefined || diffViewMode === 'manual-edit' ? 'Завершить правку' : 'Править вручную'}</span>
                    {hasManualRefinedEdits && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                    )}
                  </button>
                </div>
              </div>

              {/* Тело просмотра Diff */}
              {isManualEditingRefined || diffViewMode === 'manual-edit' ? (
                /* 1. Интерактивный ручной редактор ревизии */
                <div className="flex flex-col overflow-hidden bg-white">
                  <div className="p-3 border-b border-editorial-border bg-editorial-bg-alt/40 space-y-1.5">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-editorial-muted block">
                      Заголовок улучшенной статьи (Wiki)
                    </label>
                    <input
                      type="text"
                      value={auditResult.refinedTitle}
                      onChange={(e) => handleUpdateRefinedTitle(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-editorial-border rounded text-xs font-serif font-bold text-editorial-text focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-xs"
                      placeholder="Заголовок статьи..."
                    />
                  </div>
                  {renderEditorToolbar(refinedTextareaRef, auditResult.refinedMarkdown, handleUpdateRefinedMarkdown)}
                  <div className="p-3 overflow-hidden flex flex-col min-h-[420px]">
                    <textarea
                      ref={refinedTextareaRef}
                      value={auditResult.refinedMarkdown}
                      onChange={(e) => handleUpdateRefinedMarkdown(e.target.value)}
                      className="w-full flex-1 p-3.5 font-mono text-xs leading-relaxed text-editorial-text bg-[#FAF9F6] border border-editorial-border rounded resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 custom-scrollbar min-h-[400px]"
                      placeholder="Текст улучшенной статьи..."
                    />
                  </div>
                  <div className="px-3.5 py-2.5 bg-amber-50/90 border-t border-amber-200 text-[10px] text-amber-900 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Edit3 size={13} className="text-amber-700" />
                      <span>Любые ручные правки мгновенно отражаются в Side-by-Side Diff и готовы к публикации в BookStack.</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasManualRefinedEdits && (
                        <button
                          type="button"
                          onClick={handleResetToAiRefined}
                          className="px-2.5 py-1 bg-white border border-rose-300 rounded font-bold text-rose-800 hover:bg-rose-50 cursor-pointer shadow-xs text-[10px] flex items-center gap-1"
                        >
                          <RotateCcw size={10} />
                          Сбросить к ИИ
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setIsManualEditingRefined(false);
                          setDiffViewMode('side-by-side');
                        }}
                        className="px-3 py-1 bg-amber-600 text-white rounded font-bold hover:bg-amber-700 cursor-pointer shadow-xs text-[10px]"
                      >
                        Завершить правку и перейти в Diff
                      </button>
                    </div>
                  </div>
                </div>
              ) : diffViewMode === 'side-by-side' ? (
                /* 2. ДВУХКОЛОНОЧНЫЙ ЦВЕТНОЙ DIFF (КРАСНЫЙ / ЗЕЛЕНЫЙ) — ПО УМОЛЧАНИЮ */
                <div className="flex flex-col overflow-hidden bg-white">
                  {/* Подзаголовок колонок */}
                  <div className="grid grid-cols-2 bg-editorial-bg-alt/90 border-b border-editorial-border font-mono text-[11px] font-bold uppercase tracking-wider text-editorial-muted divide-x divide-editorial-border">
                    <div className="px-4 py-2 flex items-center justify-between bg-rose-50/70">
                      <span className="flex items-center gap-1.5 text-rose-900">
                        <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                        🔴 Исходная статья (BookStack #{selectedPageId})
                      </span>
                      <span className="text-[10px] text-rose-700 font-bold bg-rose-100 px-2 py-0.5 rounded border border-rose-200">
                        -{diffData.removedCount} строк
                      </span>
                    </div>
                    <div className="px-4 py-2 flex items-center justify-between bg-emerald-50/70">
                      <span className="flex items-center gap-1.5 text-emerald-900">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        🟢 Новая редакция {hasManualRefinedEdits ? '(с ручными правками)' : '(Ревизия KBAE)'}
                      </span>
                      <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
                        +{diffData.addedCount} строк
                      </span>
                    </div>
                  </div>

                  {/* Таблица построчного синхронизированного Diff */}
                  <div className="max-h-[680px] overflow-y-auto custom-scrollbar font-mono text-[11px] leading-relaxed divide-y divide-zinc-200/50 bg-[#FCFBF9] select-text">
                    {visibleSideBySideRows.map((row, idx) => (
                      <div key={idx} className="grid grid-cols-2 divide-x divide-editorial-border min-h-[26px]">
                        {/* Левая ячейка: Старое / Удалено (КРАСНЫЙ ФОН) */}
                        <div className={`flex items-start px-2 py-1 ${
                          row.left.type === 'removed'
                            ? 'bg-rose-100/75 text-rose-950 border-l-4 border-rose-600 font-normal'
                            : row.left.type === 'empty'
                            ? 'bg-zinc-100/50 select-none text-transparent border-l-4 border-transparent'
                            : 'bg-white text-zinc-800 hover:bg-zinc-50 border-l-4 border-transparent'
                        }`}>
                          <span className={`w-9 select-none text-right pr-2 shrink-0 font-mono text-[10px] ${
                            row.left.type === 'removed' ? 'text-rose-700 font-bold bg-rose-200/40 rounded-xs' : row.left.type === 'empty' ? 'text-transparent' : 'text-zinc-400'
                          }`}>
                            {row.left.type !== 'empty' ? row.left.lineNum : ''}
                          </span>
                          <span className={`w-5 select-none text-center shrink-0 font-bold ${
                            row.left.type === 'removed' ? 'text-rose-700' : 'text-transparent'
                          }`}>
                            {row.left.type === 'removed' ? '-' : ' '}
                          </span>
                          <div className="flex-1 whitespace-pre-wrap break-all pl-1">
                            {row.left.wordTokens && row.left.wordTokens.length > 0 ? (
                              row.left.wordTokens.map((wt, wIdx) => (
                                <span
                                  key={wIdx}
                                  className={wt.type === 'removed' ? 'bg-rose-200/90 text-rose-950 font-bold px-0.5 rounded-xs line-through decoration-rose-600 shadow-2xs' : ''}
                                >
                                  {wt.text}
                                </span>
                              ))
                            ) : row.left.type === 'removed' ? (
                              <span className="line-through decoration-rose-600/80">{row.left.text}</span>
                            ) : (
                              row.left.text || (row.left.type === 'empty' ? ' ' : '')
                            )}
                          </div>
                        </div>

                        {/* Правая ячейка: Новое / Добавлено (ЗЕЛЕНЫЙ ФОН) */}
                        <div className={`flex items-start px-2 py-1 ${
                          row.right.type === 'added'
                            ? 'bg-emerald-100/75 text-emerald-950 border-l-4 border-emerald-600 font-medium'
                            : row.right.type === 'empty'
                            ? 'bg-zinc-100/50 select-none text-transparent border-l-4 border-transparent'
                            : 'bg-white text-zinc-800 hover:bg-zinc-50 border-l-4 border-transparent'
                        }`}>
                          <span className={`w-9 select-none text-right pr-2 shrink-0 font-mono text-[10px] ${
                            row.right.type === 'added' ? 'text-emerald-700 font-bold bg-emerald-200/40 rounded-xs' : row.right.type === 'empty' ? 'text-transparent' : 'text-zinc-400'
                          }`}>
                            {row.right.type !== 'empty' ? row.right.lineNum : ''}
                          </span>
                          <span className={`w-5 select-none text-center shrink-0 font-bold ${
                            row.right.type === 'added' ? 'text-emerald-700' : 'text-transparent'
                          }`}>
                            {row.right.type === 'added' ? '+' : ' '}
                          </span>
                          <div className="flex-1 whitespace-pre-wrap break-all pl-1">
                            {row.right.wordTokens && row.right.wordTokens.length > 0 ? (
                              row.right.wordTokens.map((wt, wIdx) => (
                                <span
                                  key={wIdx}
                                  className={wt.type === 'added' ? 'bg-emerald-200/90 text-emerald-950 font-bold px-0.5 rounded-xs shadow-2xs' : ''}
                                >
                                  {wt.text}
                                </span>
                              ))
                            ) : (
                              <span>{row.right.text || (row.right.type === 'empty' ? ' ' : '')}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    {visibleSideBySideRows.length === 0 && (
                      <div className="p-10 text-center text-xs text-editorial-muted italic">
                        {diffLineFilter === 'changed'
                          ? 'Нет измененных строк (исходная статья и ревизия идентичны в данном фрагменте).'
                          : 'Нет строк для отображения.'}
                      </div>
                    )}
                  </div>
                </div>
              ) : diffViewMode === 'inline' ? (
                /* 3. ЕДИНЫЙ УНИФИЦИРОВАННЫЙ ЦВЕТНОЙ DIFF (GIT UNIFIED STYLE) */
                <div className="flex flex-col overflow-hidden bg-white">
                  <div className="px-4 py-2 bg-editorial-bg-alt/90 border-b border-editorial-border flex items-center justify-between font-mono text-[11px]">
                    <span className="text-editorial-muted font-bold uppercase tracking-wider">
                      Единый унифицированный поток различий (Unified Diff)
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-rose-700 font-bold bg-rose-100 px-2 py-0.5 rounded border border-rose-200">
                        -{diffData.removedCount}
                      </span>
                      <span className="text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
                        +{diffData.addedCount}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 max-h-[680px] overflow-y-auto custom-scrollbar font-mono text-[11px] leading-snug space-y-0.5 bg-[#FAF9F6]">
                    {visibleUnifiedLines.map((line, idx) => (
                      <div
                        key={idx}
                        className={`flex items-start px-2 py-1 rounded-xs transition-colors ${
                          line.type === 'added'
                            ? 'bg-emerald-100/80 text-emerald-950 border-l-4 border-emerald-600 font-medium'
                            : line.type === 'removed'
                            ? 'bg-rose-100/80 text-rose-950 border-l-4 border-rose-600 line-through decoration-rose-500/70'
                            : 'text-zinc-700 hover:bg-zinc-100/60 border-l-4 border-transparent'
                        }`}
                      >
                        <span className={`w-9 select-none text-right pr-2 text-[10px] ${
                          line.type === 'removed' ? 'text-rose-700 font-bold' : 'text-zinc-400'
                        }`}>
                          {line.oldLineNumber || ''}
                        </span>
                        <span className={`w-9 select-none text-right pr-2 text-[10px] ${
                          line.type === 'added' ? 'text-emerald-700 font-bold' : 'text-zinc-400'
                        }`}>
                          {line.newLineNumber || ''}
                        </span>
                        <span className={`w-6 select-none text-center font-bold ${
                          line.type === 'added' ? 'text-emerald-700' : line.type === 'removed' ? 'text-rose-700' : 'text-zinc-400'
                        }`}>
                          {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                        </span>
                        <span className="flex-1 whitespace-pre-wrap break-all pl-1">{line.text || ' '}</span>
                      </div>
                    ))}

                    {visibleUnifiedLines.length === 0 && (
                      <div className="p-10 text-center text-xs text-editorial-muted italic">
                        Нет измененных строк для отображения в выбранном фильтре.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* 4. ВИЗУАЛЬНАЯ ВЕРСТКА СТАТЕЙ (MARKDOWN ПРЕДПРОСМОТР) */
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-editorial-border">
                  {/* Левая колонка: Оригинал */}
                  <div className="flex flex-col max-h-[680px] overflow-hidden bg-editorial-bg-alt/30">
                    <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-xs border-b border-rose-200 px-5 py-2.5 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 bg-rose-50 px-2 py-0.5 border border-rose-200 rounded flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                        🔴 Старая редакция (Оригинал из BookStack)
                      </span>
                      <span className="text-[10px] font-mono text-editorial-muted">ID #{selectedPageId}</span>
                    </div>
                    <div className="p-5 sm:p-6 overflow-y-auto custom-scrollbar prose prose-stone prose-sm max-w-none font-sans text-xs leading-relaxed text-editorial-text">
                      <AEMarkdown>{originalMarkdown}</AEMarkdown>
                    </div>
                  </div>

                  {/* Правая колонка: Улучшенная версия Gemini */}
                  <div className="flex flex-col max-h-[680px] overflow-hidden bg-white">
                    <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-xs border-b border-emerald-200 px-5 py-2.5 flex items-center justify-between flex-wrap gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 border border-emerald-200 rounded flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        🟢 Новая редакция {hasManualRefinedEdits ? '(с ручными правками)' : '(Ревизия Gemini + Скиллы)'}
                      </span>
                      <div className="flex items-center gap-2">
                        {hasManualRefinedEdits && (
                          <button
                            type="button"
                            onClick={handleResetToAiRefined}
                            className="text-[10px] text-editorial-muted hover:text-rose-700 flex items-center gap-1 cursor-pointer transition-colors"
                            title="Сбросить к первоначальному тексту Gemini"
                          >
                            <RotateCcw size={11} /> Сбросить к ИИ
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setIsManualEditingRefined(true);
                            setDiffViewMode('manual-edit');
                          }}
                          className="px-2 py-0.5 text-[10px] font-bold rounded border bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border-emerald-300 flex items-center gap-1 cursor-pointer transition-all"
                        >
                          <Edit3 size={11} />
                          Править текст
                        </button>
                      </div>
                    </div>

                    <div className="p-5 sm:p-6 overflow-y-auto custom-scrollbar prose prose-stone prose-sm max-w-none font-sans text-xs leading-relaxed text-editorial-text">
                      <AEMarkdown>{auditResult.refinedMarkdown}</AEMarkdown>
                    </div>
                  </div>
                </div>
              )}

              {/* Нижняя панель действий со статьей: Кнопка применения в BookStack */}
              <div className="p-4 bg-editorial-bg-alt/60 border-t border-editorial-border flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-editorial-muted">
                  Перед публикацией в базу знаний проверьте все шаги и команды воркараунда.
                </div>

                <button
                  onClick={openRefinedConfirmModal}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold uppercase tracking-wider shadow-xs transition-all cursor-pointer active:translate-y-px"
                >
                  <UploadCloud size={15} />
                  Применить ревизию в BookStack
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 3. МОДАЛЬНОЕ ОКНО ЗАЩИТЫ ОТ СЛУЧАЙНОЙ ПЕРЕЗАПИСИ                   */}
      {/* ------------------------------------------------------------------ */}
      <AnimatePresence>
        {isConfirmModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="editorial-card max-w-lg w-full p-6 space-y-5 rounded-xl shadow-xl border border-editorial-border"
            >
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-editorial-border">
                <div className="flex items-center gap-2 text-rose-700 font-bold">
                  <AlertCircle size={20} />
                  <h3 className="font-serif text-lg">Подтверждение перезаписи статьи</h3>
                </div>
                <button
                  onClick={() => setIsConfirmModalOpen(false)}
                  className="text-editorial-muted hover:text-editorial-text cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3 text-xs text-editorial-text leading-relaxed">
                <p>
                  Вы собираетесь перезаписать содержимое страницы в <strong>BookStack</strong>:
                </p>

                <div className="p-3 bg-editorial-bg-alt/70 rounded-md border border-editorial-border space-y-1.5 font-mono text-[11px]">
                  <div><strong>ID статьи:</strong> #{confirmModalData.pageId || selectedPageId}</div>
                  <div><strong>Название:</strong> {confirmModalData.title || auditResult?.refinedTitle || selectedPageTitle}</div>
                  <div className="flex items-center gap-1.5">
                    <strong>Тип изменений:</strong>
                    <span className={`px-2 py-0.2 rounded text-[10px] font-bold ${
                      confirmModalData.type === 'refined'
                        ? (confirmModalData.hasManualEdits ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-900 border border-emerald-300')
                        : 'bg-sky-100 text-sky-900 border border-sky-300'
                    }`}>
                      {confirmModalData.type === 'refined'
                        ? (confirmModalData.hasManualEdits ? '✍️ Ревизия Gemini + Ручные правки' : '🤖 Ревизия Gemini (Авто)')
                        : '✏️ Прямые ручные правки'}
                    </span>
                  </div>
                  <div><strong>Сервер:</strong> {credentials.baseUrl || 'Демо-окружение'}</div>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle size={14} className="text-amber-700" />
                    Внимание: действие изменит живую статью в BookStack
                  </div>
                  <p className="text-[11px]">
                    {confirmModalData.type === 'refined'
                      ? 'Оригинальный текст статьи будет заменен на отредактированную версию (со всеми внесенными ручными правками).'
                      : 'Оригинальный текст статьи в BookStack будет перезаписан вашими ручными правками.'}
                  </p>
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={createBackupTag}
                    onChange={(e) => setCreateBackupTag(e.target.checked)}
                    className="w-4 h-4 text-editorial-text rounded border-editorial-border focus:ring-0 cursor-pointer"
                  />
                  <span className="text-xs font-medium text-editorial-text">
                    Добавить служебный тег ревизии (например: rev-{new Date().toISOString().slice(0, 10)})
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer pt-2 border-t border-editorial-border">
                  <input
                    type="checkbox"
                    checked={confirmCheckbox}
                    onChange={(e) => setConfirmCheckbox(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-editorial-text rounded border-editorial-border focus:ring-0 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-rose-800">
                    Я подтверждаю, что проверил изменения и готов обновить страницу в базе знаний BookStack
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-editorial-border">
                <button
                  type="button"
                  onClick={() => {
                    setIsConfirmModalOpen(false);
                    setConfirmCheckbox(false);
                  }}
                  className="px-4 py-2 bg-white border border-editorial-border rounded-md text-xs font-medium text-editorial-text hover:bg-editorial-bg-alt cursor-pointer shadow-xs transition-all"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={!confirmCheckbox || isSavingToBookStack}
                  onClick={handleApplyToBookStack}
                  className={`flex items-center gap-2 px-5 py-2 rounded-md text-xs uppercase font-semibold tracking-wider transition-all shadow-xs cursor-pointer ${
                    !confirmCheckbox || isSavingToBookStack
                      ? 'bg-zinc-200 text-zinc-400 border border-zinc-300 cursor-not-allowed shadow-none'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white active:translate-y-px'
                  }`}
                >
                  {isSavingToBookStack ? (
                    <>
                      <RefreshCw size={13} className="animate-spin text-white" /> Сохранение...
                    </>
                  ) : (
                    <>
                      <Check size={14} /> Перезаписать в BookStack
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
