import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';
import type { ResolvedTheme } from '@/components/theme-provider';

type SyntaxHighlighterModule = typeof import('react-syntax-highlighter');
type SyntaxThemeModule = typeof import('react-syntax-highlighter/dist/esm/styles/prism');

let syntaxHighlighterLoader: Promise<[SyntaxHighlighterModule, SyntaxThemeModule]> | null = null;

function normalizeStreamingMarkdown(content: string, isStreaming: boolean): string {
  if (!isStreaming) {
    return content;
  }

  const fenceMatches = content.match(/(^|\n)```/g);

  if (!fenceMatches || fenceMatches.length % 2 === 0) {
    return content;
  }

  return `${content}\n\n\`\`\``;
}

function loadSyntaxHighlighter(): Promise<[SyntaxHighlighterModule, SyntaxThemeModule]> {
  if (!syntaxHighlighterLoader) {
    syntaxHighlighterLoader = Promise.all([
      import('react-syntax-highlighter'),
      import('react-syntax-highlighter/dist/esm/styles/prism')
    ]);
  }

  return syntaxHighlighterLoader;
}

function CodeBlock(props: { code: string; language?: string; resolvedTheme: ResolvedTheme }) {
  const [copied, setCopied] = useState(false);
  const [syntaxModules, setSyntaxModules] = useState<[SyntaxHighlighterModule, SyntaxThemeModule] | null>(null);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCopied(false);
    }, 1500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [copied]);

  useEffect(() => {
    let cancelled = false;

    void loadSyntaxHighlighter().then((modules) => {
      if (!cancelled) {
        setSyntaxModules(modules);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(props.code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const SyntaxHighlighter = syntaxModules?.[0].Prism;
  const syntaxStyle = syntaxModules
    ? props.resolvedTheme === 'dark'
      ? syntaxModules[1].vscDarkPlus
      : syntaxModules[1].oneLight
    : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-background/80">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        <span>{props.language ?? 'text'}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium tracking-normal normal-case text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => {
            void handleCopy();
          }}
          aria-label={copied ? 'Code copied' : 'Copy code'}
          title={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="overflow-x-auto">
        {SyntaxHighlighter && syntaxStyle
          ? (
              <SyntaxHighlighter
                language={props.language}
                style={syntaxStyle}
                PreTag="div"
                customStyle={{
                  margin: 0,
                  padding: '1rem',
                  background: 'transparent',
                  fontSize: '0.8125rem',
                  lineHeight: '1.5'
                }}
                codeTagProps={{
                  className: cn('font-mono')
                }}
              >
                {props.code}
              </SyntaxHighlighter>
            )
          : (
              <pre className="overflow-x-auto p-4 text-[0.8125rem] leading-6">
                <code className={cn('font-mono')}>{props.code}</code>
              </pre>
            )}
      </div>
    </div>
  );
}

export function AssistantMarkdown(props: { content: string; isStreaming: boolean; tone?: 'default' | 'inverted' }) {
  const { resolvedTheme } = useTheme();
  const markdown = normalizeStreamingMarkdown(props.content, props.isStreaming);
  const tone = props.tone ?? 'default';

  return (
    <div className="space-y-3 break-words text-sm leading-6">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
          ul: ({ children }) => <ul className="ml-5 list-disc space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="ml-5 list-decimal space-y-1">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          h1: ({ children }) => <h1 className="text-base font-semibold">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold">{children}</h3>,
          a: ({ href, children }) => <a className={cn('underline underline-offset-2', tone === 'inverted' ? 'text-primary-foreground' : 'text-primary')} href={href} target="_blank" rel="noreferrer">{children}</a>,
          code: ({ className, children, ...rest }) => {
            const match = /language-([\w-]+)/.exec(className || '');
            const language = match?.[1];
            const code = String(children ?? '').replace(/\n$/, '');
            const isInline = !className;

            if (isInline) {
              return (
                <code className={cn('rounded px-1.5 py-0.5 font-mono text-[0.85em]', tone === 'inverted' ? 'bg-primary-foreground/15 text-primary-foreground' : 'bg-muted')} {...rest}>
                  {children}
                </code>
              );
            }

            const { ref, ...restWithoutRef } = rest;
            void ref;
            void restWithoutRef;

            return <CodeBlock code={code} language={language} resolvedTheme={resolvedTheme} />;
          }
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
