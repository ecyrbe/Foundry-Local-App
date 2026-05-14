import { useEffect, useRef, useState } from 'react';
import { LibraryBig, LoaderCircle, Play, SendHorizontal, Square, XCircle } from 'lucide-react';
import { AssistantMarkdown } from '@/components/assistant-markdown';
import { ModelPicker } from '@/components/domain/model-picker';
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
  isStoppingMessage: boolean;
  isSendingMessage: boolean;
  modelActionByModelId: Record<string, 'loading' | 'unloading'>;
  onLoadSessionModel: (sessionId: string) => Promise<void>;
  onOpenCatalog: () => void;
  onDraftMessageChange: (value: string) => void;
  onSendMessage: () => Promise<void>;
  onStopMessage: () => Promise<void>;
  onUnloadSessionModel: (sessionId: string) => Promise<void>;
  onUpdateSessionModel: (sessionId: string, modelId: string) => Promise<void>;
  sessions: FoundryChatSessionView[];
  stateLoadedModelCount: number;
}) {
  const [selectedModelId, setSelectedModelId] = useState('');
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldRestoreComposerFocusRef = useRef(false);

  useEffect(() => {
    if (props.activeSession && props.availableModels.some((model) => model.id === props.activeSession?.session.modelId)) {
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

  useEffect(() => {
    const textarea = composerTextareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = '0px';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [props.draftMessage, props.activeSession]);

  const activeSessionSummary = props.activeSession
    ? props.sessions.find((session) => session.id === props.activeSession?.session.id) ?? null
    : null;
  const activeSessionModelAction = activeSessionSummary ? props.modelActionByModelId[activeSessionSummary.modelId] : undefined;
  const activeSessionModelLoaded = activeSessionSummary?.modelLoaded ?? false;
  const activeSessionIsStreaming = activeSessionSummary?.isStreaming ?? false;
  const selectedModel = props.availableModels.find((model) => model.id === selectedModelId) ?? null;
  const activeModelStillAvailable = props.activeSession
    ? props.availableModels.some((model) => model.id === props.activeSession?.session.modelId)
    : true;
  const canChangeModel = Boolean(
    props.activeSession
    && !activeSessionModelLoaded
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
    && !activeSessionIsStreaming
  );
  const showStopAction = Boolean(props.activeSession && (props.isSendingMessage || activeSessionIsStreaming || props.isStoppingMessage));
  const canStop = Boolean(props.activeSession && (props.isSendingMessage || activeSessionIsStreaming) && !props.isStoppingMessage);

  useEffect(() => {
    if (props.isSendingMessage || activeSessionIsStreaming) {
      return;
    }

    if (!shouldRestoreComposerFocusRef.current) {
      return;
    }

    const textarea = composerTextareaRef.current;

    if (!textarea || textarea.disabled) {
      return;
    }

    textarea.focus();
    shouldRestoreComposerFocusRef.current = false;
  }, [activeSessionIsStreaming, props.isSendingMessage]);

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

  const renderComposer = () => (
    <div className="w-full">
      <div className="flex gap-3">
        <div className="min-w-0 flex-1 bg-transparent">
          <textarea
            ref={composerTextareaRef}
            rows={1}
            value={props.draftMessage}
            onChange={(event) => {
              props.onDraftMessageChange(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
                return;
              }

              event.preventDefault();

              if (canSend) {
                shouldRestoreComposerFocusRef.current = document.activeElement === event.currentTarget;
                void props.onSendMessage();
              }
            }}
            placeholder={props.activeSession ? 'Ask a question...' : 'Load a model first to start chatting...'}
            className="max-h-48 min-h-0 w-full resize-none overflow-y-auto border-0 bg-transparent px-0 py-2 text-sm text-foreground outline-none ring-0 placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!props.activeSession || !activeModelStillAvailable || !activeSessionModelLoaded || Boolean(activeSessionModelAction) || props.isSendingMessage || activeSessionIsStreaming}
          />
        </div>

        <div className="flex shrink-0 items-center gap-3 self-center">
          {props.activeSession ? (
            <ModelPicker
              availableModels={props.availableModels}
              disabled={!canChangeModel}
              selectedModelId={selectedModelId}
              title={selectedModel ? `${selectedModel.name} (${selectedModel.alias})` : props.activeSession.session.modelName}
              onSelectModel={(modelId) => {
                setSelectedModelId(modelId);

                if (props.activeSession && modelId !== props.activeSession.session.modelId) {
                  void props.onUpdateSessionModel(props.activeSession.session.id, modelId);
                }
              }}
            />
          ) : null}

          <Button type="button" className="h-10 self-auto" disabled={!canSend && !canStop} onClick={() => {
            if (canStop) {
              void props.onStopMessage();
              return;
            }

            shouldRestoreComposerFocusRef.current = document.activeElement === composerTextareaRef.current;
            void props.onSendMessage();
          }}>
            {showStopAction
              ? (
                  <span className="relative inline-flex size-4 items-center justify-center">
                    <LoaderCircle className="absolute inset-0 size-4 animate-spin" />
                    <Square className={cn('size-2.5 fill-current', props.isStoppingMessage ? 'animate-pulse' : undefined)} />
                  </span>
                )
                : <SendHorizontal className="size-4" />}
            {showStopAction ? 'Stop' : 'Send'}
          </Button>
        </div>
      </div>

      <div className="mt-3 min-w-0 space-y-2">
        <p className="text-xs text-muted-foreground">
          {props.activeSession
            ? activeModelStillAvailable
              ? activeSessionModelAction === 'loading'
                ? 'Model is loading for this session.'
                : activeSessionModelAction === 'unloading'
                  ? 'Model is unloading for this session.'
                  : showStopAction
                    ? 'Response is streaming now. Use Stop if the model gets stuck or loops.'
                    : activeSessionModelLoaded
                      ? 'Plain-text responses first. Session history is stored locally by the app.'
                      : canChangeModel
                        ? 'This session model is unloaded. You can switch models here before sending messages.'
                        : 'Unload the currently loaded model before changing this session model.'
              : 'This session model is no longer downloaded. Open Catalog from Settings to re-download it.'
            : 'Create a session from the sidebar to start.'}
        </p>
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
                    {!message.failed
                      ? <AssistantMarkdown content={message.content} isStreaming={message.role === 'assistant' && activeSessionIsStreaming && props.activeSession?.messages.at(-1)?.id === message.id} tone={message.role === 'user' ? 'inverted' : 'default'} />
                      : <p className="whitespace-pre-wrap break-words">{message.content}</p>}
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

          <div className="sticky bottom-0 z-10 border-t border-border/60 bg-background px-4 pt-[14px] sm:px-6">
            {renderComposer()}
          </div>
        </>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-6 pt-18 sm:px-6">
            <div className="flex w-full max-w-4xl flex-col items-center gap-8 text-center">
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight">How can I help?</h1>
                <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
                  <span>{props.activeSession.session.modelName}</span>
                  {renderModelControl()}
                </div>
                <p className="max-w-xl text-sm text-muted-foreground">
                  {activeModelStillAvailable ? `This session uses ${props.activeSession.session.modelName}. Load the model from the sidebar, or unload it to switch to another downloaded model.` : 'This session model is missing. Re-download it from Catalog or switch this session to another downloaded model.'}
                </p>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 z-10 border-t border-border/60 bg-background px-4 pt-[14px] sm:px-6">
            {renderComposer()}
          </div>
        </>
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
