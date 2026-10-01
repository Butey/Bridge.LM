export interface OmnideskCredentials {
  domain: string;
  email: string;
  apiKey: string;
}

export interface BookStackCredentials {
  baseUrl: string;
  tokenId: string;
  tokenSecret: string;
}

export interface BookStackBook {
  id: number;
  name: string;
  description: string;
}

export interface BookStackChapter {
  id: number;
  book_id: number;
  name: string;
  description: string;
}

export interface SyncConfig {
  credentials: BookStackCredentials;
  targetBookId: number | null;
  targetChapterId: number | null;
  mapping: {
    tags: string[]; // e.g. "KnowledgeBase", "AI-Generated"
    priority: 'high' | 'normal' | 'low';
    extractSummaryAsDescription: boolean;
  };
}

export interface BookStackPage {
  id: number;
  name: string;
  book_id: number;
  chapter_id?: number | null;
  markdown: string;
  tags?: { name: string; value: string } [];
  html?: string;
  raw_html?: string;
  slug?: string;
  priority?: number;
  revision_count?: number;
  created_at?: string;
  updated_at?: string;
  url?: string;
  editor?: 'wysiwyg' | 'markdown' | string;
  description?: string;
}

export interface SourceMetadata {
  title?: string;
  author?: string;
  creationDate?: string;
}

export interface Source {
  name: string;
  content: string;
  selected?: boolean;
  isDuplicate?: boolean;
  isContext?: boolean;
  duplicateReference?: string;
  metadata?: SourceMetadata;
  attachments?: { mimeType: string; data: string; name: string }[];
  ticketUrl?: string;
  ticketNumber?: string;
}

export interface ProcessedArticle {
  title: string;
  content: string;
  thinking: string;
  markdown?: string;
  description?: string;
  targetPublishMode: 'create' | 'update';
  targetPublishPageId: number | null;
  targetPublishBookId: number | null;
  targetPublishChapterId?: number | null;
  tags: string[];
  targetBookId?: number | null;
  newBookName?: string;
  targetChapterId?: number | null;
  newChapterName?: string;
  duplicateLinks?: string[];
  originalMarkdown?: string;
  originalTitle?: string;
}

export interface QualityScorecard {
  overallScore: number;     // 0-100
  humanityScore: number;    // 0-100 (естественность русского языка, отсутствие канцелярита)
  antiSlopScore: number;    // 0-100 (чистота от штампов no-ai-slop, стоп-слов)
  structureScore: number;   // 0-100 (структура KB: симптомы, решение, воркараунд)
  formattingScore: number;  // 0-100 (callout блоки, таблицы, код, ссылки)
}

export interface AuditIssue {
  id: string;
  category: 'humanity' | 'slop' | 'structure' | 'formatting' | 'clarity' | 'accuracy' | 'completeness' | 'links' | 'security' | string;
  severity: 'critical' | 'warning' | 'info' | 'low' | 'medium' | 'high';
  title: string;
  rule?: string;
  originalSnippet?: string;
  suggestion?: string;
  suggestedFix?: string;
  explanation?: string;
  description?: string;
  lineNumber?: number;
  location?: string;
}

export interface AuditMetric {
  name: string;
  score: number; // 0-100
  status: 'good' | 'warning' | 'critical';
  description?: string;
}

export interface AuditSuggestion {
  id: string;
  type?: 'addition' | 'refactor' | 'formatting' | 'seo' | 'tone' | string;
  title: string;
  recommendation: string;
  impact?: 'low' | 'medium' | 'high';
}

/**
 * Полный отчет аудита статьи от ИИ (Gemini)
 */
export interface ArticleAuditReport {
  overallScore: number; // 0-100
  verdict?: 'excellent' | 'good' | 'needs_improvement' | 'critical_rework' | string;
  summary: string;
  metrics: AuditMetric[];
  issues: AuditIssue[];
  suggestions: AuditSuggestion[];
  improvedTitle?: string;
  auditedAt?: string;
  modelUsed?: string;
  estimatedReadTimeMinutes?: number;
}

export interface AuditDiffLine {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
  lineNumOld?: number;
  lineNumNew?: number;
}

export interface AuditDiffSummary {
  addedLines: number;
  removedLines: number;
  modifiedSections?: string[];
  unifiedDiff?: string;
  changes?: AuditDiffLine[];
}

/**
 * Снимок страницы BookStack для возможности безопасного отката (Rollback)
 */
export interface BookStackPageSnapshot {
  pageId: number;
  bookId: number;
  chapterId?: number | null;
  name: string;
  markdown: string;
  html?: string;
  tags?: { name: string; value: string }[];
  revisionNumber?: number;
  savedAt: string;
  summary?: string;
}

/**
 * Состояние сессии аудита и ревизии статьи
 */
export interface AuditSessionState {
  selectedPage: BookStackPage | null;
  originalMarkdown: string;
  refinedMarkdown: string;
  isAuditing: boolean;
  isRefining: boolean;
  isSaving?: boolean;
  isRollingBack?: boolean;
  diff: AuditDiffSummary | null;
  auditReport?: ArticleAuditReport | null;
  auditResult?: ArticleAuditResult | null;
  error?: string | null;
  lastSavedAt?: string | null;
  snapshotHistory?: BookStackPageSnapshot[];
}

export interface SafeUpdatePageOptions {
  name?: string;
  markdown?: string;
  html?: string;
  tags?: string[] | { name: string; value: string }[];
  summary?: string; // Примечание к ревизии BookStack
  description?: string;
  book_id?: number;
  chapter_id?: number | null;
}

export interface ArticleAuditChangeItem {
  type: 'removed' | 'added' | 'modified';
  category?: 'slop' | 'humanity' | 'structure' | 'formatting' | string;
  title: string;
  description: string;
  oldSnippet?: string;
  newSnippet?: string;
}

export interface ArticleAuditResult {
  pageId: number;
  originalTitle: string;
  originalMarkdown: string;
  refinedTitle: string;
  refinedMarkdown: string;
  refinedDescription?: string;
  scorecard: QualityScorecard;
  issues: AuditIssue[];
  summary: string;
  changesSummary?: ArticleAuditChangeItem[];
  analyzedAt: string;
  modelUsed: string;
  hasManualEdits?: boolean;
  aiOriginalMarkdown?: string;
  aiOriginalTitle?: string;
  stats?: {
    originalWords: number;
    refinedWords: number;
    reductionPercent: number;
    addedLines: number;
    removedLines: number;
  };
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

export interface ArticleEngineAuditResult {
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


