import { useState, useEffect } from 'react';
import { ClipboardList } from 'lucide-react';
import { WorkspacePanel } from './WorkspacePanel';
import { ConfigurationModal } from './ConfigurationModal';
import { AgentSkillsPanel } from './AgentSkillsPanel';
import { indexVectorDocument } from '../services/api';
import { GeminiModelId } from '../services/gemini';

interface SourceEditorPanelProps {
  onSaveSettings?: () => void;
  activeSkills: Record<string, boolean>;
  setActiveSkills: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  defaultActiveSkills: Record<string, boolean>;
  setDefaultActiveSkills: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  // Config Modal Props
  isConfigOpen: boolean;
  setIsConfigOpen: (v: boolean) => void;
  systemInstruction: string;
  setSystemInstruction: (v: string) => void;
  dataStructure: string;
  setDataStructure: (v: string) => void;
  searchPrompt: string;
  setSearchPrompt: (v: string) => void;
  duplicatePrompt: string;
  setDuplicatePrompt: (v: string) => void;
  contextPrompt: string;
  setContextPrompt: (v: string) => void;
  workMode: 'auto' | 'review';
  setWorkMode: (v: 'auto' | 'review') => void;
  geminiModel: GeminiModelId;
  setGeminiModel: (v: GeminiModelId) => void;
  credentials: any;
  setCredentials: (v: any) => void;
  omnideskCreds: any;
  setOmnideskCreds: (v: any) => void;
  serverConfig: any;
  handleSpecialFileUpload: (e: React.ChangeEvent<HTMLInputElement>, target: 'system' | 'structure') => Promise<void>;
  loadBooks: () => void;
  isLoadingBooks: boolean;
  books?: any[];

  // Workspace Props
  sources: any[];
  setSources: (v: any) => void;
  processFiles: (files: File[]) => Promise<void>;
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  setPreviewSource: (v: any) => void;
  uploadProgress: { percent: number; label: string } | null;
  pdfExtractionMode: 'gemini' | 'markitdown';
  setPdfExtractionMode: (v: 'gemini' | 'markitdown') => void;

  // SourceEditor Props
  executionControl: any;
  instructions: string;
  setInstructions: (v: string) => void;
  content: string;
  setContent: (v: string) => void;
  customPresets: any[];
  setCustomPresets: React.Dispatch<React.SetStateAction<any[]>>;
  selectedPreset: string;
  setSelectedPreset: React.Dispatch<React.SetStateAction<string>>;
  customSkills?: any[];
  setCustomSkills?: React.Dispatch<React.SetStateAction<any[]>>;
}

export function SourceEditorPanel(props: SourceEditorPanelProps) {
  const [ticketId, setTicketId] = useState('');
  const [hasAutoLoadedTicket, setHasAutoLoadedTicket] = useState(false);

  useEffect(() => {
    // Check URL for ticket parameter (e.g. ?ticket=123456)
    const urlParams = new URLSearchParams(window.location.search);
    const urlTicket = urlParams.get('ticket');
    
    if (urlTicket && !hasAutoLoadedTicket && props.omnideskCreds.domain && props.omnideskCreds.email && props.omnideskCreds.apiKey) {
      setTicketId(urlTicket);
      setHasAutoLoadedTicket(true);
      
      // Auto trigger the load
      const syntheticEvent = { preventDefault: () => {} } as React.FormEvent;
      // Note: we can't directly call handleLoadTicket with the state because setTicketId is async.
      // So we extract the logic or just use urlTicket directly.
      loadTicketById(urlTicket);
    }
  }, [props.omnideskCreds, hasAutoLoadedTicket]);

  const loadTicketById = (idToLoad: string) => {
    const cleanId = idToLoad.trim();
    if (!cleanId) return;

    if (!props.omnideskCreds.domain || !props.omnideskCreds.email || !props.omnideskCreds.apiKey) {
      alert('Сначала укажите настройки Omnidesk в Конфигурации агента');
      return;
    }

    props.executionControl.setIsSyncing(true);
    props.executionControl.setSyncStatus({ type: 'idle', message: 'Загрузка тикета...' });

    fetch('/api/omnidesk/ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...props.omnideskCreds, ticketId: cleanId })
    })
      .then(r => r.json())
      .then(async data => {
        if (data.error) throw new Error(data.error);
        props.setSources((prev: any) => [...prev, {
          name: data.name,
          content: data.content,
          attachments: data.attachments || [],
          ticketUrl: data.ticketUrl,
          ticketNumber: data.caseNumber || String(data.caseId || cleanId)
        }]);
        
        let indexErrorText = '';
        try {
          await indexVectorDocument(`ticket:${cleanId}`, data.content, {
            name: data.name,
            type: 'ticket'
          });
        } catch (err: any) {
          console.error('Failed to index ticket to vector DB', err);
          const responseErr = err.response?.data?.error || err.message || '';
          if (responseErr.includes('API_KEY_INVALID')) {
            indexErrorText = ' (Ошибка векторизации ИИ: [API_KEY_INVALID] Неработающий API-ключ Gemini. Проверьте настройки администрирования)';
          } else {
            indexErrorText = ` (Ошибка векторизации ИИ: ${responseErr})`;
          }
        }

        if (indexErrorText) {
          props.executionControl.setSyncStatus({ 
            type: 'error', 
            message: `Тикет ${cleanId} загружен с Omnidesk, но не проиндексирован во встроенную базу данных.${indexErrorText}` 
          });
        } else {
          props.executionControl.setSyncStatus({ 
            type: 'success', 
            message: `Тикет ${cleanId} успешно загружен и заиндексирован` 
          });
        }
        setTicketId('');
      })
      .catch(err => {
        props.executionControl.setSyncStatus({ type: 'error', message: err.message });
      })
      .finally(() => {
        props.executionControl.setIsSyncing(false);
        setTimeout(() => {
          props.executionControl.setSyncStatus({ type: 'idle', message: '' });
        }, 5000);
      });
  };

  const handleLoadTicket = (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    loadTicketById(ticketId);
  };


  return (
    <div className="lg:col-span-8 flex flex-col gap-8">
      <ConfigurationModal
        isOpen={props.isConfigOpen}
        systemInstruction={props.systemInstruction}
        setSystemInstruction={props.setSystemInstruction}
        dataStructure={props.dataStructure}
        setDataStructure={props.setDataStructure}
        searchPrompt={props.searchPrompt}
        setSearchPrompt={props.setSearchPrompt}
        duplicatePrompt={props.duplicatePrompt}
        setDuplicatePrompt={props.setDuplicatePrompt}
        contextPrompt={props.contextPrompt}
        setContextPrompt={props.setContextPrompt}
        workMode={props.workMode}
        setWorkMode={props.setWorkMode}
        geminiModel={props.geminiModel}
        setGeminiModel={props.setGeminiModel}
        credentials={props.credentials}
        setCredentials={props.setCredentials}
        omnideskCreds={props.omnideskCreds}
        setOmnideskCreds={props.setOmnideskCreds}
        serverConfig={props.serverConfig}
        handleSpecialFileUpload={props.handleSpecialFileUpload}
        loadBooks={props.loadBooks}
        isLoadingBooks={props.isLoadingBooks}
        books={props.books}
        onSave={() => {
          if (props.onSaveSettings) {
            props.onSaveSettings();
          }
          props.setIsConfigOpen(false);
        }}
      />

      <div className="flex flex-col gap-6">
        <WorkspacePanel 
          sources={props.sources}
          setSources={props.setSources}
          processFiles={props.processFiles}
          isDragging={props.isDragging}
          setIsDragging={props.setIsDragging}
          setPreviewSource={props.setPreviewSource}
          uploadProgress={props.uploadProgress}
          pdfExtractionMode={props.pdfExtractionMode}
          setPdfExtractionMode={props.setPdfExtractionMode}
        />

        <form 
          onSubmit={handleLoadTicket}
          className="editorial-card rounded-lg h-11 flex overflow-hidden border border-editorial-border shadow-xs"
        >
          <div className="flex-1 flex items-center px-4 border-r border-editorial-border bg-editorial-bg-alt/50">
            <span className="text-[10px] font-bold uppercase tracking-wider text-editorial-muted mr-2.5 shrink-0">Omnidesk</span>
            <input
              type="text"
              placeholder="ID тикета (напр. 123456)"
              className="w-full bg-transparent outline-none text-xs font-mono text-editorial-text placeholder:font-sans placeholder:text-editorial-muted/70"
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value)}
            />
          </div>
          <button 
            type="submit"
            className="flex items-center px-4 bg-editorial-text text-white text-[10px] font-semibold uppercase tracking-wider shrink-0 cursor-pointer hover:bg-black transition-colors"
          >
            Загрузить тикет
          </button>
        </form>

        <AgentSkillsPanel
          activeSkills={props.activeSkills}
          setActiveSkills={props.setActiveSkills}
          defaultActiveSkills={props.defaultActiveSkills}
          setDefaultActiveSkills={props.setDefaultActiveSkills}
          systemInstruction={props.systemInstruction}
          setSystemInstruction={props.setSystemInstruction}
          dataStructure={props.dataStructure}
          setDataStructure={props.setDataStructure}
          geminiModel={props.geminiModel}
          onSaveSettings={props.onSaveSettings || (() => {})}
          customPresets={props.customPresets}
          setCustomPresets={props.setCustomPresets}
          selectedPreset={props.selectedPreset}
          setSelectedPreset={props.setSelectedPreset}
          customSkills={props.customSkills}
          setCustomSkills={props.setCustomSkills}
        />

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-editorial-muted">Цель текущей задачи</label>
          <textarea 
            className="w-full h-28 p-3.5 bg-white border border-editorial-border rounded-lg shadow-xs focus:border-editorial-border-dark focus:outline-none transition-all text-xs text-editorial-text placeholder:italic placeholder:text-editorial-muted/70 resize-none font-sans"
            placeholder="Например: 'Составь подробное резюме этих заметок, уделив внимание хронологии событий...'"
            value={props.instructions}
            onChange={(e) => props.setInstructions(e.target.value)}
          />
        </div>

        <div className="relative">
          <textarea 
            className="w-full h-[280px] p-6 bg-white border border-editorial-border rounded-lg shadow-xs focus:border-editorial-border-dark focus:outline-none transition-all resize-none text-xs leading-relaxed text-editorial-text placeholder:text-editorial-muted/70 font-sans"
            placeholder="Вставьте дополнительный исходный текст или логи здесь..."
            value={props.content}
            onChange={(e) => props.setContent(e.target.value)}
            disabled={props.executionControl.isSyncing}
          />
          <div className="absolute top-0 right-0 p-4 text-editorial-muted/40 pointer-events-none">
            <ClipboardList size={22} />
          </div>
        </div>
      </div>
    </div>
  );
}
