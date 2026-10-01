export function AppFooter() {
  return (
    <footer className="max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12">
      <div className="border-t border-editorial-border pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-editorial-muted flex items-center gap-3">
          <span>Активность модуля</span>
          <span className="w-1.5 h-1.5 bg-editorial-terracotta rounded-full"></span>
        </div>
        <div className="flex gap-6 overflow-hidden whitespace-nowrap text-xs text-editorial-muted">
          <p>Gemini AI Активен</p>
          <p className="opacity-30">•</p>
          <p>BookStack Proxy v1.1.0</p>
          <p className="opacity-30">•</p>
          <p>Secure Token Auth Ready</p>
        </div>
        <div className="text-[11px] font-mono text-editorial-muted/60 uppercase tracking-tight">
          v4.0.0-ru (KBAE v4.0)
        </div>
      </div>
    </footer>
  );
}
