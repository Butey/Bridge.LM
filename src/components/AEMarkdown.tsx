import React from 'react';
import Markdown from 'react-markdown';
import { MermaidRenderer } from './MermaidRenderer';
import { Info, Lightbulb, AlertTriangle, AlertCircle, ShieldAlert } from 'lucide-react';

interface AEMarkdownProps {
  children: string;
}

type CalloutType = 'note' | 'tip' | 'important' | 'warning' | 'caution';

function getCalloutConfig(type: CalloutType) {
  switch (type) {
    case 'note':
      return {
        label: 'ПРИМЕЧАНИЕ',
        icon: <Info size={15} className="text-sky-600 shrink-0 mt-0.5" />,
        containerClass: 'border-l-4 border-sky-500 bg-sky-50/80 border-y border-r border-sky-200/60 text-sky-950',
        titleClass: 'text-sky-800',
      };
    case 'tip':
      return {
        label: 'СОВЕТ',
        icon: <Lightbulb size={15} className="text-emerald-600 shrink-0 mt-0.5" />,
        containerClass: 'border-l-4 border-emerald-500 bg-emerald-50/80 border-y border-r border-emerald-200/60 text-emerald-950',
        titleClass: 'text-emerald-800',
      };
    case 'important':
      return {
        label: 'ВАЖНО',
        icon: <AlertCircle size={15} className="text-indigo-600 shrink-0 mt-0.5" />,
        containerClass: 'border-l-4 border-indigo-500 bg-indigo-50/80 border-y border-r border-indigo-200/60 text-indigo-950',
        titleClass: 'text-indigo-800',
      };
    case 'warning':
      return {
        label: 'ВНИМАНИЕ',
        icon: <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />,
        containerClass: 'border-l-4 border-amber-500 bg-amber-50/80 border-y border-r border-amber-200/60 text-amber-950',
        titleClass: 'text-amber-900',
      };
    case 'caution':
      return {
        label: 'ОСТОРОЖНО',
        icon: <ShieldAlert size={15} className="text-rose-600 shrink-0 mt-0.5" />,
        containerClass: 'border-l-4 border-rose-500 bg-rose-50/80 border-y border-r border-rose-200/60 text-rose-950',
        titleClass: 'text-rose-900',
      };
  }
}

function extractFirstText(child: any): string {
  if (!child) return '';
  if (typeof child === 'string') return child;
  if (typeof child === 'number') return String(child);
  if (Array.isArray(child)) {
    for (const c of child) {
      const txt = extractFirstText(c);
      if (txt) return txt;
    }
  }
  if (React.isValidElement(child) && child.props && (child.props as any).children) {
    return extractFirstText((child.props as any).children);
  }
  return '';
}

function stripMarkerFromChildren(child: React.ReactNode, isFirst = true): React.ReactNode {
  if (!child) return child;
  if (typeof child === 'string') {
    if (isFirst) {
      return child.replace(/^\s*\[!(NOTE|INFO|TIP|SUCCESS|IMPORTANT|WARNING|CAUTION|DANGER|ERROR)\]\s*/i, '');
    }
    return child;
  }
  if (Array.isArray(child)) {
    let stripped = false;
    return child.map((c) => {
      if (!stripped) {
        const text = extractFirstText(c);
        if (/^\s*\[!(NOTE|INFO|TIP|SUCCESS|IMPORTANT|WARNING|CAUTION|DANGER|ERROR)\]/i.test(text)) {
          stripped = true;
          return stripMarkerFromChildren(c, true);
        }
      }
      return c;
    });
  }
  if (React.isValidElement(child) && child.props && (child.props as any).children) {
    const strippedChild = stripMarkerFromChildren((child.props as any).children, isFirst);
    return React.cloneElement(child, {
      ...(child.props as any),
      children: strippedChild,
    });
  }
  return child;
}

function cleanCalloutChildren(children: React.ReactNode): React.ReactNode {
  const stripped = stripMarkerFromChildren(children);
  if (Array.isArray(stripped)) {
    return stripped.filter((c: any) => {
      if (React.isValidElement(c) && (c.props as any)?.children === '') {
        return false;
      }
      if (typeof c === 'string' && !c.trim()) {
        return false;
      }
      return true;
    });
  }
  return stripped;
}

function preprocessCallouts(content: string): string {
  if (!content) return '';
  return content.replace(/<div class=["']callout\s+(info|warning|danger|success)["']>([\s\S]*?)<\/div>/gi, (_, type, body) => {
    let calloutType = 'NOTE';
    const lowerType = type.toLowerCase();
    if (lowerType === 'warning') calloutType = 'WARNING';
    else if (lowerType === 'danger') calloutType = 'CAUTION';
    else if (lowerType === 'success') calloutType = 'TIP';

    const text = body
      .replace(/<p>/gi, '')
      .replace(/<\/p>/gi, '\n')
      .replace(/<ul>/gi, '')
      .replace(/<\/ul>/gi, '')
      .replace(/<li>/gi, '- ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<code>(.*?)<\/code>/gi, '`$1`')
      .replace(/<br\s*\/?>/gi, '\n');

    const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => Boolean(l));
    const quoted = lines.map((l: string) => `> ${l}`).join('\n');
    return `> [!${calloutType}]\n${quoted}\n`;
  });
}

export function AEMarkdown({ children }: AEMarkdownProps) {
  const processedContent = preprocessCallouts(children || '');

  return (
    <Markdown
      components={{
        a(props) {
          const { href, children: linkChildren, ...rest } = props;
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-editorial-accent hover:underline inline-flex items-center gap-0.5 font-medium break-all"
              {...rest}
            >
              {linkChildren}
            </a>
          );
        },
        blockquote(props) {
          const { children: bqChildren, ...rest } = props;
          const firstText = extractFirstText(bqChildren);
          const match = firstText.match(/^\s*\[!(NOTE|INFO|TIP|SUCCESS|IMPORTANT|WARNING|CAUTION|DANGER|ERROR)\]/i);

          if (match) {
            const rawType = match[1].toUpperCase();
            let type: CalloutType = 'note';
            if (rawType === 'TIP' || rawType === 'SUCCESS') type = 'tip';
            else if (rawType === 'IMPORTANT') type = 'important';
            else if (rawType === 'WARNING') type = 'warning';
            else if (rawType === 'CAUTION' || rawType === 'DANGER' || rawType === 'ERROR') type = 'caution';

            const config = getCalloutConfig(type);
            const cleaned = cleanCalloutChildren(bqChildren);

            return (
              <div className={`my-3 p-3.5 rounded-lg text-xs leading-relaxed shadow-xs not-prose ${config.containerClass}`}>
                <div className="flex items-center gap-2 mb-1.5 select-none">
                  {config.icon}
                  <span className={`font-bold text-[11px] uppercase tracking-wider ${config.titleClass}`}>
                    {config.label}
                  </span>
                </div>
                <div className="space-y-1.5 pl-6 font-sans">
                  {cleaned}
                </div>
              </div>
            );
          }

          return (
            <blockquote
              className="border-l-4 border-editorial-border pl-4 py-1.5 my-3 italic text-editorial-muted bg-editorial-bg-alt/40 rounded-r-md"
              {...rest}
            >
              {bqChildren}
            </blockquote>
          );
        },
        table(props) {
          return (
            <div className="overflow-x-auto my-3 border border-editorial-border rounded-lg shadow-xs not-prose">
              <table className="min-w-full divide-y divide-editorial-border text-xs text-left" {...props} />
            </div>
          );
        },
        thead(props) {
          return <thead className="bg-editorial-bg-alt font-semibold text-editorial-text" {...props} />;
        },
        th(props) {
          return <th className="px-3 py-2 border-b border-editorial-border text-[11px] font-bold uppercase tracking-wider text-editorial-text" {...props} />;
        },
        td(props) {
          return <td className="px-3 py-2 border-b border-editorial-border/60 text-editorial-text" {...props} />;
        },
        code(props) {
          const { children: codeChildren, className, ...rest } = props;
          const match = /language-mermaid/.exec(className || '');
          const codeString = String(codeChildren || '').replace(/\n$/, '');
          if (match) {
            return <MermaidRenderer code={codeString} />;
          }
          return (
            <code className={className} {...rest}>
              {codeChildren}
            </code>
          );
        }
      }}
    >
      {processedContent}
    </Markdown>
  );
}
