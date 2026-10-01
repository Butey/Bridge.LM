import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Send, Loader2, CheckCircle, AlertCircle, HelpCircle, Book, Layers, ChevronRight } from 'lucide-react';
import { BookStackBook, BookStackChapter, BookStackPage } from '../types';

interface KnowledgeSyncPanelProps {
  // Config & State
  targetMode: 'create' | 'update';
  setTargetMode: (mode: 'create' | 'update') => void;
  selectedBookId: number | null;
  setSelectedBookId: (id: number | null) => void;
  selectedChapterId: number | null;
  setSelectedChapterId: (id: number | null) => void;
  selectedPageId: number | null;
  setSelectedPageId: (id: number | null) => void;
  customTags: string;
  setCustomTags: (tags: string) => void;
  
  // Data Source
  books: BookStackBook[];
  chapters: BookStackChapter[];
  pages: BookStackPage[];
  isLoadingBooks: boolean;
  isLoadingChapters: boolean;
  isLoadingPages: boolean;

  // Actions
  handleSync: () => void;
  loadChaptersAndPages: (id: number) => Promise<void>;
  loadChapterPages: (id: number) => Promise<void>;
  executionControl: any;
  sourcesLength: number;
  contentLength: number;
  handleGenerateMindmap: () => void;
  handleGenerateFAQ: () => void;
  handleGenerateMermaid: () => void;
  setIsConfigOpen: (v: boolean) => void;
}

export function KnowledgeSyncPanel({
  targetMode, setTargetMode,
  selectedBookId, setSelectedBookId,
  selectedChapterId, setSelectedChapterId,
  selectedPageId, setSelectedPageId,
  customTags, setCustomTags,
  books, chapters, pages,
  isLoadingBooks, isLoadingChapters, isLoadingPages,
  handleSync, loadChaptersAndPages, loadChapterPages,
  executionControl, sourcesLength, contentLength,
  handleGenerateMindmap, handleGenerateFAQ, handleGenerateMermaid, setIsConfigOpen
}: KnowledgeSyncPanelProps) {
  const [copiedLink, setCopiedLink] = useState(false);

  const bookName = selectedBookId 
    ? books.find(b => b.id === selectedBookId)?.name 
    : 'Автоматический выбор';
    
  const chapterName = selectedChapterId 
    ? chapters.find(c => c.id === selectedChapterId)?.name 
    : (selectedBookId ? 'Корень книги' : null);
    
  const pageName = selectedPageId 
    ? pages.find(p => p.id === selectedPageId)?.name 
    : (targetMode === 'update' ? null : null);

  return (
    <div className="lg:col-span-4 flex flex-col gap-6">
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="font-serif text-2xl font-bold tracking-tight text-editorial-text">Синхронизация Wiki</h2>
          <p className="text-xs text-editorial-muted leading-relaxed">Сопоставьте данные со структурой BookStack для публикации.</p>
        </div>
        
        <div className="editorial-card rounded-lg p-5 sm:p-6 space-y-6 shadow-xs border border-editorial-border">
          <div className="space-y-4">
            <div className="flex p-0.5 bg-editorial-bg-alt border border-editorial-border rounded-md shadow-xs">
              <button 
                onClick={() => setTargetMode('create')}
                className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer ${
                  targetMode === 'create' ? 'bg-white text-editorial-text shadow-xs' : 'text-editorial-muted hover:text-editorial-text'
                }`}
              >
                Создать новую
              </button>
              <button 
                onClick={() => setTargetMode('update')}
                className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer ${
                  targetMode === 'update' ? 'bg-white text-editorial-text shadow-xs' : 'text-editorial-muted hover:text-editorial-text'
                }`}
              >
                Обновить
              </button>
            </div>

            <div className="space-y-1.5 border-b border-editorial-border/60 pb-4">
              <label className="text-[10px] font-bold uppercase tracking-wider text-editorial-muted">Целевая Книга (или Авто)</label>
              <select 
                className="w-full py-2 bg-transparent font-semibold outline-none appearance-none cursor-pointer"
                value={selectedBookId || ''}
                onChange={(e) => {
                  const id = Number(e.target.value) || null;
                  if (id) {
                    loadChaptersAndPages(id);
                  } else {
                    setSelectedBookId(null);
                    setSelectedChapterId(null);
                    setSelectedPageId(null);
                  }
                }}
                disabled={isLoadingBooks || books.length === 0}
              >
                <option value="">{isLoadingBooks ? 'Загрузка книг...' : 'Автоматический выбор...'}</option>
                {books.map(book => (
                  <option key={book.id} value={book.id}>{book.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2 border-b border-gray-100 pb-4">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">Глава (или Авто)</label>
              <select 
                className="w-full py-2 bg-transparent font-semibold outline-none appearance-none cursor-pointer"
                value={selectedChapterId || ''}
                onChange={(e) => {
                  const id = Number(e.target.value) || null;
                  if (id) {
                    loadChapterPages(id);
                  } else {
                    setSelectedChapterId(null);
                    setSelectedPageId(null);
                  }
                }}
                disabled={(!selectedBookId && targetMode === 'update') || isLoadingChapters}
              >
                <option value="">{isLoadingChapters ? 'Загрузка глав...' : 'Автоматический выбор или корень...'}</option>
                {chapters.map(chapter => (
                  <option key={chapter.id} value={chapter.id}>{chapter.name}</option>
                ))}
              </select>
            </div>

            {targetMode === 'update' && (
              <div className="space-y-2 border-b border-gray-100 pb-4">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">Статья для обновления</label>
                <select 
                  className="w-full py-2 bg-transparent font-semibold outline-none appearance-none cursor-pointer"
                  value={selectedPageId || ''}
                  onChange={(e) => setSelectedPageId(Number(e.target.value) || null)}
                  disabled={!selectedBookId || isLoadingPages || (pages.length === 0 && !isLoadingPages)}
                >
                  <option value="">{isLoadingPages ? 'Загрузка статей...' : 'Выберите статью...'}</option>
                  {pages.map(page => (
                    <option key={page.id} value={page.id}>{page.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#8E8E8A]">Метки (через запятую)</label>
              <input 
                type="text"
                className="w-full py-2 bg-transparent font-semibold border-b border-gray-200 outline-none text-sm"
                value={customTags}
                onChange={(e) => setCustomTags(e.target.value)}
                placeholder="Например: AI, 2024"
              />
            </div>
          </div>

          <div className="p-3 bg-gray-50 border border-dashed border-gray-200 rounded-[2px] transition-all">
            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-1.5">
              <Layers size={10} />
              Маршрут публикации
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-tight leading-tight">
              <span className="text-editorial-text truncate max-w-[120px]" title={bookName}>{bookName}</span>
              <ChevronRight size={10} className="text-gray-300" />
              {chapterName && (
                <>
                  <span className="text-editorial-text truncate max-w-[120px]" title={chapterName}>{chapterName}</span>
                  <ChevronRight size={10} className="text-gray-300" />
                </>
              )}
              <span className={targetMode === 'create' ? 'text-green-600' : 'text-blue-600'}>
                {targetMode === 'create' ? 'Новая статья' : (pageName || 'Статья не выбрана')}
              </span>
            </div>
          </div>

          <div className="relative pt-6">
            <div className="absolute -top-3 left-0 bg-white pr-2 text-[10px] font-bold uppercase tracking-widest">Автоматизация</div>
            <button 
              onClick={() => {
                if (!executionControl.isSyncing && (sourcesLength > 0 || contentLength > 0)) {
                  handleSync();
                }
              }}
              disabled={!executionControl.isSyncing && sourcesLength === 0 && contentLength === 0}
              className={`w-full text-white text-sm uppercase tracking-widest font-bold shadow-xl active:scale-95 transition-all flex items-center justify-center ${
                executionControl.isSyncing 
                  ? 'bg-editorial-text py-4 cursor-wait' 
                  : 'bg-editorial-text py-6 disabled:bg-gray-200 disabled:text-gray-400 hover:bg-black cursor-pointer'
              }`}
            >
              {executionControl.isSyncing ? (
                <div className="flex flex-col items-center gap-2.5 w-full px-5">
                  <div className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-xs uppercase tracking-widest font-bold text-white">
                      Синхронизация ({executionControl.syncProgress.total ? Math.round((executionControl.syncProgress.step / executionControl.syncProgress.total) * 100) : 0}%)
                    </span>
                  </div>
                  {/* Miniature progress bar inside the button */}
                  <div className="w-full h-1.5 bg-white/20 border border-white/10 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${executionControl.syncProgress.total ? (executionControl.syncProgress.step / executionControl.syncProgress.total) * 100 : 0}%` }}
                      className="h-full bg-white transition-all duration-300"
                    />
                  </div>
                  {executionControl.syncProgress.label && (
                    <span className="text-[9px] font-medium tracking-wider text-white/70 text-center uppercase truncate w-full">
                      {executionControl.syncProgress.label}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center gap-3">
                  <Send size={20} />
                  Запустить агент
                </div>
              )}
            </button>
          </div>

          <AnimatePresence>
            {executionControl.syncStatus.type !== 'idle' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`p-4 border-2 ${
                  executionControl.syncStatus.type === 'success' 
                    ? 'bg-green-50 border-green-500 text-green-900' 
                    : 'bg-red-50 border-red-500 text-red-900'
                }`}
              >
                <div className="flex gap-3">
                  {executionControl.syncStatus.type === 'success' ? <CheckCircle size={18} className="shrink-0" /> : <AlertCircle size={18} className="shrink-0" />}
                  <div className="flex flex-col gap-1">
                    <p className="text-[11px] font-bold uppercase leading-tight tracking-tight">
                      {executionControl.syncStatus.message.replace('[QUOTA_EXCEEDED]', '').replace('[INVALID_MODEL]', '').trim()}
                    </p>
                    {executionControl.syncStatus.url && (
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <a 
                          href={executionControl.syncStatus.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-[9px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5"
                        >
                          Открыть статью 🔗
                        </a>
                        <button 
                          onClick={() => {
                            if (executionControl.syncStatus.url) {
                              navigator.clipboard.writeText(executionControl.syncStatus.url)
                                .then(() => {
                                  setCopiedLink(true);
                                  setTimeout(() => setCopiedLink(false), 2000);
                                })
                                .catch(() => {
                                  const el = document.createElement('textarea');
                                  el.value = executionControl.syncStatus.url!;
                                  document.body.appendChild(el);
                                  el.select();
                                  document.execCommand('copy');
                                  document.body.removeChild(el);
                                  setCopiedLink(true);
                                  setTimeout(() => setCopiedLink(false), 2000);
                                });
                            }
                          }}
                          className="px-3 py-1 bg-white hover:bg-gray-100 text-green-700 border border-green-300 text-[9px] font-bold uppercase tracking-widest transition-colors cursor-pointer"
                        >
                          {copiedLink ? '✓ Скопировано!' : 'Копировать ссылку'}
                        </button>
                      </div>
                    )}
                    {(executionControl.syncStatus.message.includes('[QUOTA_EXCEEDED]') || executionControl.syncStatus.message.includes('[INVALID_MODEL]')) && (
                      <button
                        onClick={() => setIsConfigOpen(true)}
                        className="mt-2 text-left self-start px-3 py-2 bg-red-600 text-white text-[10px] whitespace-nowrap font-bold uppercase tracking-widest hover:bg-red-700 transition-colors"
                      >
                        Сменить модель ИИ
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={handleGenerateMindmap}
          disabled={executionControl.isSyncing || (sourcesLength === 0 && contentLength === 0)}
          className="py-2.5 bg-white border border-editorial-border hover:border-editorial-border-dark rounded-md text-[10px] uppercase font-semibold text-editorial-text shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          title="Создать Mindmap"
        >
          Mindmap
        </button>
        <button
          onClick={handleGenerateFAQ}
          disabled={executionControl.isSyncing || (sourcesLength === 0 && contentLength === 0)}
          className="py-2.5 bg-white border border-editorial-border hover:border-editorial-border-dark rounded-md text-[10px] uppercase font-semibold text-editorial-text shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          title="Сгенерировать FAQ"
        >
          FAQ
        </button>
        <button
          onClick={handleGenerateMermaid}
          disabled={executionControl.isSyncing || (sourcesLength === 0 && contentLength === 0)}
          className="py-2.5 bg-white border border-editorial-border hover:border-editorial-border-dark rounded-md text-[10px] uppercase font-semibold text-editorial-text shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          title="Сгенерировать схему Mermaid"
        >
          Схема Mermaid
        </button>
      </div>

      {/* Справка Mindmap vs Mermaid */}
      <div className="bg-editorial-bg-alt/50 border border-editorial-border rounded-lg p-4 text-[11px] space-y-2 leading-relaxed shadow-xs">
        <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-editorial-text text-[10px] mb-1">
          <HelpCircle size={14} className="text-editorial-terracotta shrink-0" />
          Mindmap vs Mermaid
        </div>
        <p className="text-editorial-muted">
          <strong className="text-editorial-text">Mindmap (Интеллект-карта)</strong> — это древовидная структура ассоциаций и понятий. Идеально для конспектирования и структурирования тем.
        </p>
        <p className="text-editorial-muted">
          <strong className="text-editorial-text">Схема Mermaid</strong> — блок-схема процесса или алгоритма (Symptom ➔ Fix). Идеально для регламентов и архитектур.
        </p>
      </div>

      <div className="p-6 border border-dashed border-editorial-border rounded-lg bg-white/60">
        <h3 className="font-serif text-lg font-bold text-editorial-text mb-3">Рабочий процесс</h3>
        <div className="space-y-3">
          {[
            { step: "01", text: "Соберите знания в тикетах, логах или файлах" },
            { step: "02", text: "Загрузите источники в рабочую область" },
            { step: "03", text: "Укажите цель для агента Bridge.LM" },
            { step: "04", text: "Синхронизируйте с вашей базой знаний" }
          ].map((item) => (
            <div key={item.step} className="flex gap-3 items-start">
              <span className="text-xs font-mono font-bold text-editorial-terracotta">{item.step}.</span>
              <p className="text-xs text-editorial-text leading-snug">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
