import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FoundryCatalogModelView } from '../../../shared/foundry-state.js';

function ModelPicker(props: {
  availableModels: FoundryCatalogModelView[];
  disabled: boolean;
  selectedModelId: string;
  title: string;
  onSelectModel: (modelId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedModel = props.availableModels.find((model) => model.id === props.selectedModelId) ?? null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!props.disabled) {
      return;
    }

    setIsOpen(false);
  }, [props.disabled]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        className={cn(
          'inline-flex h-10 min-w-0 max-w-32 items-center justify-between gap-2 rounded-full border border-sky-200/80 bg-sky-100/80 px-3 text-sm font-medium text-sky-950 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          props.disabled || props.availableModels.length === 0 ? 'cursor-not-allowed opacity-50' : 'hover:border-sky-300 hover:bg-sky-100'
        )}
        disabled={props.disabled || props.availableModels.length === 0}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        title={props.title}
        onClick={() => {
          setIsOpen((currentValue) => !currentValue);
        }}
      >
        <span className="truncate">{selectedModel?.alias ?? 'Model'}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-sky-900/70 transition-transform', isOpen ? 'rotate-180' : undefined)} />
      </button>

      {isOpen ? (
        <div className="absolute bottom-full right-0 z-20 mb-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-background shadow-lg">
          <div className="max-h-72 overflow-y-auto py-1" role="listbox" aria-label="Available models">
            {props.availableModels.map((model) => {
              const isSelected = model.id === props.selectedModelId;

              return (
                <button
                  key={model.id}
                  type="button"
                  className={cn('flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground', isSelected ? 'bg-accent/60' : undefined)}
                  onClick={() => {
                    setIsOpen(false);
                    props.onSelectModel(model.id);
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 font-medium">{model.alias}</span>
                      <span className="truncate text-muted-foreground">{model.name}</span>
                    </div>
                  </div>
                  {isSelected ? <Check className="size-4 shrink-0 text-foreground" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { ModelPicker };
