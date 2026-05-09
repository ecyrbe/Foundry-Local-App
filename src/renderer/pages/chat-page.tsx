import { useEffect, useRef, useState } from 'react';
import { LibraryBig, LoaderCircle, Play, SendHorizontal, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FoundryCatalogModelView, FoundryChatMessageView, FoundryChatSessionDetailView, FoundryChatSessionView } from '../../shared/foundry-state.js';
import { CatalogButton, formatTimestamp } from './shared';

function ChatPage(props: {
  activeSession: FoundryChatSessionDetailView | null;
  availableModels: FoundryCatalogModelView[];
  chatError: string | null;
  draftMessage: string;
  isCreatingSession: boolean;
  isLoadingSession: boolean;
  isSendingMessage: boolean;
  modelActionByModelId: Record<string, 'loading' | 'unloading'>;
  onLoadSessionModel: (sessionId: string) => Promise<void>;
  onOpenCatalog: () => void;
  onDraftMessageChange: (value: string) => void;
  onSendMessage: () => Promise<void>;
  onUnloadSessionModel: (sessionId: string) => Promise<void>;
  onUpdateSessionModel: (sessionId: string, modelId: string) => Promise<void>;
  sessions: FoundryChatSessionView[];
  stateLoadedModelCount: number;
}) {
  const [selectedModelId, setSelectedModelId] = useState('');
  const messageListRef = useRef<HTMLDivElement | null>(null);

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
    const container = messageListRef.current;

    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [props.activeSession, props.isSendingMessage]);

  const activeSessionSummary = props.activeSession
    ? props.sessions.find((session) => session.id === props.activeSession.session.id) ?? null
    : null;
  const activeSessionModelAction = activeSessionSummary ? props.modelActionByModelId[activeSessionSummary.modelId] : undefined;
  const activeSessionModelLoaded = activeSessionSummary?.modelLoaded ?? false;
  const activeModelStillAvailable = props.activeSession
    ? props.availableModels.some((model) => model.id === props.activeSession.session.modelId)
    : true;
  const canChangeModel = Boolean(
    props.activeSession
    && props.activeSession.messages.length === 0
    && props.stateLoadedModelCount === 0
    && !activeSessionModelAction
  );
  const canSend = Boolean(
    props.activeSession
    && activeModelStillAvailable
    && activeSessionModelLoaded
    && !activeSessionModelAction
    && props.draftMessage.trim()
    && !props.isSendingMessage
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

  const renderComposer = (centered: boolean) => (
    <div className={cn(
      'w-full rounded-[1.75rem] border border-border/70 bg-card/85 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/75',
      centered ? 'max-w-3xl' : 'mx-auto max-w-4xl'
    )}>
      <textarea
        value={props.draftMessage}
        onChange={(event) => {
          props.onDraftMessageChange(event.target.value);
        }}
        placeholder={props.activeSession ? 'Message the current session' : 'Create a session first'}
        className="min-h-28 w-full resize-none border-0 bg-transparent px-3 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!props.activeSession || !activeModelStillAvailable || !activeSessionModelLoaded || Boolean(activeSessionModelAction) || props.isSendingMessage}
      />

      <div className="flex flex-col gap-3 border-t border-border/60 px-3 pt-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          {props.activeSession && props.activeSession.messages.length === 0 ? (
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
                {props.availableModels.length === 0 ? <option value="">No downloaded text models available</option> : null}
                {props.availableModels.map((model) => (
                  <option key={model.id} value={model.id}>{model.name} ({model.alias})</option>
                ))}
              </select>
              {!canChangeModel && props.activeSession ? <p className="text-xs text-muted-foreground">Unload the currently loaded model before changing this empty session.</p> : null}
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            {props.activeSession
              ? activeModelStillAvailable
                ? activeSessionModelAction === 'loading'
                  ? 'Model is loading for this session.'
                  : activeSessionModelAction === 'unloading'
                    ? 'Model is unloading for this session.'
                    : activeSessionModelLoaded
                      ? 'Plain-text responses first. Session history is stored locally by the app.'
                      : 'Load this session model from the sidebar before sending messages.'
                : 'This session model is no longer downloaded. Open Catalog from Settings to re-download it.'
              : 'Create a session from the sidebar to start.'}
          </p>
        </div>

        <Button type="button" disabled={!canSend} onClick={() => {
          void props.onSendMessage();
        }}>
          {props.isSendingMessage ? <LoaderCircle className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
          Send
        </Button>
      </div>
    </div>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none absolute right-4 top-4 z-20 sm:right-6">
        <div className="pointer-events-auto">
          <CatalogButton onClick={props.onOpenCatalog} />
        </div>
      </div>

      {props.chatError ? (
        <div className="px-4 pt-18 sm:px-6">
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {props.chatError}
          </div>
        </div>
      ) : null}

      {props.activeSession ? props.activeSession.messages.length > 0 ? (
        <>
          <div ref={messageListRef} className="min-h-0 flex-1 overflow-auto px-4 pb-6 pt-18 sm:px-6">
            <div className="mx-auto flex max-w-4xl flex-col gap-6">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-semibold">{props.activeSession.session.title}</h1>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>{props.activeSession.session.modelName}</span>
                    {renderModelControl()}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{props.activeSession.session.modelAlias}</Badge>
                  {activeModelStillAvailable ? <Badge variant={activeSessionModelAction ? 'outline' : activeSessionModelLoaded ? 'success' : 'default'}>{activeSessionModelAction === 'loading' ? 'Loading model' : activeSessionModelAction === 'unloading' ? 'Unloading model' : activeSessionModelLoaded ? 'Model loaded' : 'Model not loaded'}</Badge> : <Badge variant="destructive">Model missing</Badge>}
                </div>
              </div>

              {props.activeSession.messages.map((message: FoundryChatMessageView) => (
                <div key={message.id} className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn(
                    'max-w-[min(100%,44rem)] rounded-3xl px-5 py-4 text-sm shadow-sm',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : message.failed
                        ? 'border border-destructive/30 bg-destructive/10 text-destructive'
                        : 'border border-border/70 bg-card/90 text-card-foreground'
                  )}>
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    <p className={cn('mt-3 text-[11px]', message.role === 'user' ? 'text-primary-foreground/80' : message.failed ? 'text-destructive/80' : 'text-muted-foreground')}>
                      {formatTimestamp(message.createdAt)}
                    </p>
                  </div>
                </div>
              ))}

              {props.isLoadingSession ? (
                <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                  Loading session
                </div>
              ) : null}
            </div>
          </div>

          <div className="border-t border-border/60 px-4 py-4 sm:px-6">
            {renderComposer(false)}
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-6 pt-18 sm:px-6">
            <div className="flex w-full max-w-4xl flex-col items-center gap-8 text-center">
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight">How can I help?</h1>
                <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
                  <span>{props.activeSession.session.modelName}</span>
                  {renderModelControl()}
                </div>
                <p className="max-w-xl text-sm text-muted-foreground">
                  {activeModelStillAvailable ? `This session uses ${props.activeSession.session.modelName}. Load the model from the sidebar, or switch models while the session is still empty.` : 'This session model is missing. Re-download it from Catalog or switch this empty session to another downloaded model.'}
                </p>
            </div>
            {renderComposer(true)}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-6 pt-18 sm:px-6">
          <div className="space-y-3 text-center">
            <h1 className="text-3xl font-semibold tracking-tight">How can I help?</h1>
            <p className="max-w-xl text-sm text-muted-foreground">Create a new chat from the sidebar to start.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export { ChatPage };
