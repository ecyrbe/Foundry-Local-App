import { useEffect, useRef, useState } from 'react';
import { LibraryBig, LoaderCircle, Mic, Play, Square, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  FoundryCatalogModelView,
  FoundryTranscriptEntryView,
  FoundryTranscriptSessionDetailView,
  FoundryTranscriptSessionView
} from '../../shared/foundry-state.js';
import { CatalogButton, formatTimestamp } from './shared';

function formatTimeOffset(value: number | null): string | null {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }

  return `${value.toFixed(1)}s`;
}

function TranscriptPage(props: {
  activeSession: FoundryTranscriptSessionDetailView | null;
  availableModels: FoundryCatalogModelView[];
  isCreatingSession: boolean;
  isLoadingSession: boolean;
  isStartingTranscription: boolean;
  isStoppingTranscription: boolean;
  modelActionByModelId: Record<string, 'loading' | 'unloading'>;
  onLoadSessionModel: (sessionId: string) => Promise<void>;
  onOpenCatalog: () => void;
  onStartTranscription: () => Promise<void>;
  onStopTranscription: () => Promise<void>;
  onUnloadSessionModel: (sessionId: string) => Promise<void>;
  onUpdateSessionModel: (sessionId: string, modelId: string) => Promise<void>;
  previewText: string;
  sessions: FoundryTranscriptSessionView[];
  stateLoadedModelCount: number;
  transcriptError: string | null;
}) {
  const [selectedModelId, setSelectedModelId] = useState('');
  const entryListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (props.activeSession && props.availableModels.some((model) => model.id === props.activeSession.session.modelId)) {
      setSelectedModelId(props.activeSession.session.modelId);
      return;
    }

    if (props.availableModels.some((model) => model.id === selectedModelId)) {
      return;
    }

    setSelectedModelId(props.availableModels[0]?.id ?? '');
  }, [props.activeSession, props.availableModels, selectedModelId]);

  useEffect(() => {
    const container = entryListRef.current;

    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [props.activeSession, props.previewText, props.isStartingTranscription]);

  const activeSessionSummary = props.activeSession
    ? props.sessions.find((session) => session.id === props.activeSession.session.id) ?? null
    : null;
  const activeSessionModelAction = activeSessionSummary ? props.modelActionByModelId[activeSessionSummary.modelId] : undefined;
  const activeSessionModelLoaded = activeSessionSummary?.modelLoaded ?? false;
  const activeSessionIsTranscribing = activeSessionSummary?.isTranscribing ?? false;
  const activeModelStillAvailable = props.activeSession
    ? props.availableModels.some((model) => model.id === props.activeSession.session.modelId)
    : true;
  const canChangeModel = Boolean(
    props.activeSession
    && props.activeSession.entries.length === 0
    && !activeSessionIsTranscribing
    && props.stateLoadedModelCount === 0
    && !activeSessionModelAction
  );
  const canStart = Boolean(
    props.activeSession
    && activeModelStillAvailable
    && activeSessionModelLoaded
    && !activeSessionIsTranscribing
    && !activeSessionModelAction
    && !props.isStartingTranscription
    && !props.isStoppingTranscription
  );
  const canStop = Boolean(
    props.activeSession
    && activeSessionIsTranscribing
    && !props.isStoppingTranscription
  );

  const renderModelControl = () => {
    if (!props.activeSession) {
      return null;
    }

    if (!activeModelStillAvailable) {
      return (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 rounded-full border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15"
          disabled
          aria-label="Model missing"
          title="Model missing"
        >
          <XCircle className="size-4" />
        </Button>
      );
    }

    if (activeSessionModelAction === 'loading' || activeSessionModelAction === 'unloading') {
      return (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 rounded-full border border-amber-700/15 bg-amber-500/15 text-amber-800 hover:bg-amber-500/20"
          disabled
          aria-label={activeSessionModelAction === 'loading' ? 'Loading model' : 'Unloading model'}
          title={activeSessionModelAction === 'loading' ? 'Loading model' : 'Unloading model'}
        >
          <LoaderCircle className="size-4 animate-spin" />
        </Button>
      );
    }

    return (
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={cn(
          'size-8 rounded-full border',
          activeSessionModelLoaded
            ? 'border-emerald-800/15 bg-emerald-100 text-emerald-950 hover:bg-emerald-200'
            : 'border-border bg-secondary text-secondary-foreground hover:bg-secondary/80'
        )}
        aria-label={activeSessionModelLoaded ? 'Unload model' : 'Load model'}
        title={activeSessionModelLoaded ? 'Unload model' : 'Load model'}
        onClick={() => {
          void (activeSessionModelLoaded ? props.onUnloadSessionModel(props.activeSession!.session.id) : props.onLoadSessionModel(props.activeSession!.session.id));
        }}
      >
        {activeSessionModelLoaded ? <XCircle className="size-4" /> : <Play className="size-4" />}
      </Button>
    );
  };

  const renderTranscriptControl = () => (
    <Button type="button" disabled={!canStart && !canStop} onClick={() => {
      if (canStop) {
        void props.onStopTranscription();
        return;
      }

      void props.onStartTranscription();
    }}>
      {props.isStartingTranscription || props.isStoppingTranscription ? <LoaderCircle className="size-4 animate-spin" /> : canStop ? <Square className="size-4" /> : <Mic className="size-4" />}
      {props.isStartingTranscription ? 'Starting' : props.isStoppingTranscription ? 'Stopping' : canStop ? 'Stop transcription' : 'Start transcription'}
    </Button>
  );

  const renderModelPicker = () => (
    props.activeSession && props.activeSession.entries.length === 0 ? (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={selectedModelId}
          onChange={(event) => {
            const nextModelId = event.target.value;
            setSelectedModelId(nextModelId);

            if (props.activeSession && nextModelId !== props.activeSession.session.modelId) {
              void props.onUpdateSessionModel(props.activeSession.session.id, nextModelId);
            }
          }}
          className="flex h-10 min-w-0 rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canChangeModel || props.availableModels.length === 0 || props.isCreatingSession}
        >
          {props.availableModels.length === 0 ? <option value="">No downloaded audio models available</option> : null}
          {props.availableModels.map((model) => (
            <option key={model.id} value={model.id}>{model.name} ({model.alias})</option>
          ))}
        </select>
        {!canChangeModel && props.activeSession ? <p className="text-xs text-muted-foreground">Unload the currently loaded model before changing this empty session.</p> : null}
      </div>
    ) : null
  );

  const renderEntry = (entry: FoundryTranscriptEntryView) => {
    const startOffset = formatTimeOffset(entry.startTime);
    const endOffset = formatTimeOffset(entry.endTime);

    return (
      <div key={entry.id} className={cn(
        'rounded-3xl border px-5 py-4 shadow-sm',
        entry.failed ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-border/70 bg-card/90 text-card-foreground'
      )}>
        <p className="whitespace-pre-wrap break-words text-sm">{entry.content}</p>
        <div className={cn('mt-3 flex flex-wrap items-center gap-2 text-[11px]', entry.failed ? 'text-destructive/80' : 'text-muted-foreground')}>
          <span>{formatTimestamp(entry.createdAt)}</span>
          {startOffset ? <span>{startOffset}</span> : null}
          {endOffset ? <span>{endOffset}</span> : null}
        </div>
      </div>
    );
  };

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none absolute right-4 top-4 z-20 sm:right-6">
        <div className="pointer-events-auto">
          <CatalogButton onClick={props.onOpenCatalog} />
        </div>
      </div>

      {props.transcriptError ? (
        <div className="px-4 pt-18 sm:px-6">
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {props.transcriptError}
          </div>
        </div>
      ) : null}

      {props.activeSession ? (
        <>
          <div ref={entryListRef} className="min-h-0 flex-1 overflow-auto px-4 pb-6 pt-18 sm:px-6">
            <div className="mx-auto flex max-w-4xl flex-col gap-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-semibold">{props.activeSession.session.title}</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>{props.activeSession.session.modelName}</span>
                    {renderModelControl()}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{props.activeSession.session.modelAlias}</Badge>
                  {activeSessionIsTranscribing ? <Badge variant="success">Live</Badge> : null}
                  {activeModelStillAvailable ? <Badge variant={activeSessionModelAction ? 'outline' : activeSessionModelLoaded ? 'success' : 'default'}>{activeSessionModelAction === 'loading' ? 'Loading model' : activeSessionModelAction === 'unloading' ? 'Unloading model' : activeSessionModelLoaded ? 'Model loaded' : 'Model not loaded'}</Badge> : <Badge variant="destructive">Model missing</Badge>}
                </div>
              </div>

              {renderModelPicker()}

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border/70 bg-card/85 px-5 py-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/75">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Live microphone transcription</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {activeModelStillAvailable
                      ? activeSessionModelLoaded
                        ? activeSessionIsTranscribing
                          ? 'Streaming live audio into the selected local model.'
                          : 'Start a live transcript when you are ready. Only final segments are saved to session history.'
                        : 'Load this session model from the sidebar before starting transcription.'
                      : 'This session model is no longer downloaded. Open Catalog from Settings to re-download it.'}
                  </p>
                </div>
                {renderTranscriptControl()}
              </div>

              {props.previewText ? (
                <div className="rounded-3xl border border-primary/20 bg-primary/5 px-5 py-4 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-primary/80">
                    <Mic className="size-3.5" />
                    Live hint
                  </div>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm text-foreground">{props.previewText}</p>
                </div>
              ) : null}

              {props.activeSession.entries.length > 0 ? props.activeSession.entries.map(renderEntry) : (
                <div className="rounded-3xl border border-dashed border-border/70 bg-background/20 px-6 py-12 text-center">
                  <Mic className="mx-auto size-8 text-muted-foreground" />
                  <h2 className="mt-4 text-lg font-semibold">No transcript entries yet</h2>
                  <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
                    {activeModelStillAvailable ? 'Pick an audio model, load it, and start a live transcript to build this session history.' : 'Re-download the missing model or switch this empty session to another downloaded audio model.'}
                  </p>
                </div>
              )}

              {props.isLoadingSession ? (
                <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                  Loading session
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-6 pt-18 sm:px-6">
          <div className="space-y-3 text-center">
            <h1 className="text-3xl font-semibold tracking-tight">Start listening locally</h1>
            <p className="max-w-xl text-sm text-muted-foreground">Create a new transcript session from the sidebar to begin live audio transcription.</p>
            <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <LibraryBig className="size-4" />
              Download an audio model first from Catalog if needed
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { TranscriptPage };
