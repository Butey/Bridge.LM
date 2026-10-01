import { MessageSquare, Terminal, Settings, Loader2, Sparkles, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BookStackCredentials } from '../types';

interface AppHeaderProps {
  credentials: BookStackCredentials;
  isChatOpen: boolean;
  setIsChatOpen: (v: boolean) => void;
  isConsoleOpen: boolean;
  setIsConsoleOpen: (v: boolean) => void;
  isConfigOpen: boolean;
  setIsConfigOpen: (v: boolean) => void;
  isSyncing?: boolean;
  syncProgress?: { step: number; total: number; label: string };
  workMode: 'auto' | 'review';
  activeTab?: 'synthesis' | 'audit';
  setActiveTab?: (tab: 'synthesis' | 'audit') => void;
}

export function AppHeader({
  credentials,
  isChatOpen, setIsChatOpen,
  isConsoleOpen, setIsConsoleOpen,
  isConfigOpen, setIsConfigOpen,
  isSyncing,
  syncProgress,
  workMode,
  activeTab = 'synthesis',
  setActiveTab
}: AppHeaderProps) {
  const percent = (syncProgress && syncProgress.total > 0) 
    ? Math.round((syncProgress.step / syncProgress.total) * 100) 
    : 0;

  return (
    <nav className="border-b border-editorial-border sticky top-0 z-30 bg-editorial-bg/95 backdrop-blur-md">
      <div className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
        {/* Бренд и переключатель основных режимов */}
        <div className="flex items-center gap-4 sm:gap-6 min-w-0">
          <div className="flex items-baseline gap-2.5 shrink-0">
            <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-editorial-text">Bridge.LM</h1>
            <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-amber-100 text-amber-900 rounded border border-amber-300">v4.0</span>
            <span className="hidden xl:inline-flex accent-pill">Gemini ↔ BookStack</span>
          </div>

          {setActiveTab && (
            <div className="flex items-center p-0.5 bg-editorial-bg-alt rounded-lg border border-editorial-border shadow-xs shrink-0">
              <button
                onClick={() => setActiveTab('synthesis')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'synthesis'
                    ? 'bg-white text-editorial-text shadow-xs font-semibold'
                    : 'text-editorial-muted hover:text-editorial-text'
                }`}
              >
                <Sparkles size={13} className={activeTab === 'synthesis' ? 'text-editorial-terracotta' : ''} />
                <span className="hidden sm:inline">Синтез статей</span>
                <span className="sm:hidden">Синтез</span>
              </button>
              <button
                onClick={() => setActiveTab('audit')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'audit'
                    ? 'bg-white text-editorial-text shadow-xs font-semibold'
                    : 'text-editorial-muted hover:text-editorial-text'
                }`}
                title="Аудит и ревизия статей Базы Знаний BookStack"
              >
                <ShieldCheck size={13} className={activeTab === 'audit' ? 'text-editorial-sage' : ''} />
                <span className="hidden sm:inline">Аудит статей БЗ</span>
                <span className="sm:hidden">Статьи БЗ</span>
              </button>
            </div>
          )}
        </div>
        
        {/* Статусы и инструменты */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <AnimatePresence>
            {isSyncing && syncProgress && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="hidden md:flex items-center gap-2 px-3 py-1 bg-white border border-editorial-border rounded-full shadow-xs"
              >
                <Loader2 size={12} className="animate-spin text-editorial-terracotta" />
                <div className="flex flex-col">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-editorial-muted">Статус</span>
                  <span className="text-[10px] font-medium text-editorial-text truncate max-w-[140px]">
                    {syncProgress.label || 'Обработка...'}
                  </span>
                </div>
                <div className="pl-1.5 border-l border-editorial-border">
                  <span className="text-[10px] font-mono font-bold text-editorial-text">{percent}%</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Статус соединения BookStack */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-editorial-border bg-white text-[10px] font-medium text-editorial-muted shadow-xs">
            <span className={`w-1.5 h-1.5 rounded-full ${credentials.baseUrl ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            <span>{credentials.baseUrl ? 'BookStack' : 'Офлайн'}</span>
          </div>

          {/* Режим работы */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-editorial-border bg-white text-[10px] font-medium text-editorial-muted shadow-xs">
            <span className={`w-1.5 h-1.5 rounded-full ${workMode === 'auto' ? 'bg-amber-500 animate-pulse' : 'bg-sky-500'}`}></span>
            <span>{workMode === 'auto' ? 'Автономный' : 'Ручной'}</span>
          </div>

          {/* Чат */}
          <button
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer border ${
              isChatOpen 
                ? 'bg-editorial-text text-white border-editorial-text shadow-xs' 
                : 'bg-white text-editorial-text border-editorial-border hover:border-editorial-border-dark shadow-xs'
            }`}
            title="Чат с агентом"
          >
            <MessageSquare size={14} />
            <span className="hidden md:inline">Чат</span>
          </button>

          {/* Логи */}
          <button 
            onClick={() => setIsConsoleOpen(!isConsoleOpen)}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer border ${
              isConsoleOpen 
                ? 'bg-editorial-text text-white border-editorial-text shadow-xs' 
                : 'bg-white text-editorial-text border-editorial-border hover:border-editorial-border-dark shadow-xs'
            }`}
            title="Консоль логов агента"
          >
            <Terminal size={14} />
            <span className="hidden md:inline">Логи</span>
          </button>

          {/* Настройки */}
          <button 
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer border ${
              isConfigOpen 
                ? 'bg-editorial-text text-white border-editorial-text shadow-xs' 
                : 'bg-white text-editorial-text border-editorial-border hover:border-editorial-border-dark shadow-xs'
            }`}
            title="Параметры и ключи"
          >
            <Settings size={14} className={`transition-transform duration-300 ${isConfigOpen ? 'rotate-90' : ''}`} />
            <span className="hidden md:inline">Настройки</span>
          </button>
        </div>

        {/* Индикатор прогресса внизу шапки */}
        <AnimatePresence>
          {isSyncing && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: '3px', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="absolute bottom-0 left-0 right-0 bg-editorial-border/40 z-20 pointer-events-none"
            >
              <motion.div
                className="h-full bg-editorial-terracotta relative"
                initial={{ width: 0 }}
                animate={{ width: `${percent}%` }}
                transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
              >
                <motion.div
                  className="absolute top-0 bottom-0 w-32 bg-white/50 blur-sm"
                  animate={{ left: ['-100%', '200%'] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}
