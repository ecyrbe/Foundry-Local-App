import { useEffect, useMemo, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Ellipsis, LoaderCircle, MessageSquare, PanelLeftClose, PanelLeftOpen, Play, Plus, Settings, Trash2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { StatusBar, StatusBarContent } from '@/components/ui/status-bar';
import { cn } from '@/lib/utils';
import type {
  FoundryAppState,
  FoundryCatalogAction,
  FoundryCatalogModelView,
  FoundryChatMessageView,
  FoundryChatSessionDetailView,
  FoundryChatSessionView,
  FoundryChatStreamEvent,
  FoundryDownloadProgressEvent,
  FoundryEpDownloadProgressEvent,
  FoundryRuntimeView
} from '../shared/foundry-state.js';
import { CatalogPage } from './pages/catalog-page';
import { ChatPage } from './pages/chat-page';
import { SettingsRuntimePage } from './pages/settings-runtime-page';
import { formatTimestamp } from './pages/shared';

const loadingState: FoundryAppState = {
  bootstrapStage: 'starting',
  sdkStage: 'initializing',
  webServiceStage: 'stopped',
  loadedModelCount: 0,
  startupConfigSummary: 'Loading startup configuration...',
  webServiceUrls: [],
  lastError: null
};

function getStatusTone(value: 'ready' | 'failed' | 'running' | 'stopped' | 'initializing' | 'starting'): string {
  if (value === 'ready' || value === 'running') {
    return 'success';
  }

  if (value === 'failed') {
    return 'destructive';
  }

  return 'default';
}

function StatusPill(props: { label: string; value: string; tone: 'ready' | 'failed' | 'running' | 'stopped' | 'initializing' | 'starting' }) {
  return (
    <Badge variant={getStatusTone(props.tone) as 'default' | 'success' | 'destructive'} className="min-w-0 px-2.5 py-0.5 text-[11px] leading-4">
      {props.label}: {props.value}
    </Badge>
  );
}

function SessionMenu(props: {
  deletingSessionId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onLoadSessionModel: (sessionId: string) => Promise<void>;
  onUnloadSessionModel: (sessionId: string) => Promise<void>;
  session: FoundryChatSessionView;
  sessionAction?: 'loading' | 'unloading';
}) {
  return props.isOpen ? (
    <div className="absolute right-3 top-10 z-20 w-44 rounded-xl border border-border/70 bg-popover p-1 shadow-lg">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
        disabled={props.sessionAction === 'loading' || props.sessionAction === 'unloading' || props.deletingSessionId === props.session.id}
        onClick={() => {
          props.onClose();
          void (props.session.modelLoaded ? props.onUnloadSessionModel(props.session.id) : props.onLoadSessionModel(props.session.id));
        }}
      >
        {props.sessionAction === 'loading' || props.sessionAction === 'unloading' ? <LoaderCircle className="size-4 animate-spin" /> : props.session.modelLoaded ? <XCircle className="size-4" /> : <Play className="size-4" />}
        <span>{props.sessionAction === 'loading' ? 'Loading model' : props.sessionAction === 'unloading' ? 'Unloading model' : props.session.modelLoaded ? 'Unload model' : 'Load model'}</span>
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
        disabled={props.deletingSessionId === props.session.id || props.sessionAction === 'loading' || props.sessionAction === 'unloading'}
        onClick={() => {
          props.onClose();
          void props.onDeleteSession(props.session.id);
        }}
      >
        {props.deletingSessionId === props.session.id ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        <span>{props.deletingSessionId === props.session.id ? 'Deleting' : 'Delete session'}</span>
      </button>
    </div>
  ) : null;
}

function ChatSidebar(props: {
  activeSessionId: string | null;
  deletingSessionId: string | null;
  isCollapsed: boolean;
  isCreatingSession: boolean;
  modelActionByModelId: Record<string, 'loading' | 'unloading'>;
  onCreateSession: () => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onLoadSessionModel: (sessionId: string) => Promise<void>;
  onNavigateSystem: () => void;
  onOpenSession: (sessionId: string) => Promise<void>;
  onToggleCollapse: () => void;
  onUnloadSessionModel: (sessionId: string) => Promise<void>;
  sessions: FoundryChatSessionView[];
}) {
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!props.sessions.some((session) => session.id === menuSessionId)) {
      setMenuSessionId(null);
    }
  }, [menuSessionId, props.sessions]);

  return (
    <aside className={cn(
      'relative flex h-full min-w-0 flex-col border-r border-border/70 bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/80 transition-[width] duration-200',
      props.isCollapsed ? 'w-[76px]' : 'w-[320px]'
    )}>
      <div className="flex items-center justify-between px-3 pt-3">
        <Button type="button" variant="ghost" size="icon" aria-label={props.isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={props.onToggleCollapse}>
          {props.isCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </Button>
        {!props.isCollapsed ? (
          <div className="flex min-w-0 items-center gap-2 px-2">
            <MessageSquare className="size-4 text-primary" />
            <span className="truncate text-sm font-medium">Chat</span>
          </div>
        ) : null}
        <Button type="button" variant="ghost" size="icon" aria-label="Create session" disabled={props.isCreatingSession} onClick={() => {
          void props.onCreateSession();
        }}>
          {props.isCreatingSession ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-4">
        <div className="space-y-2">
          {props.sessions.length > 0 ? props.sessions.map((session) => {
            const isActive = props.activeSessionId === session.id;
            const sessionAction = props.modelActionByModelId[session.modelId];

            return (
              <div key={session.id} className="relative">
                <button
                  type="button"
                  className={cn(
                    'flex w-full min-w-0 items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors',
                    isActive ? 'bg-secondary text-secondary-foreground' : 'hover:bg-accent/70'
                  )}
                  onClick={() => {
                    setMenuSessionId(null);
                    void props.onOpenSession(session.id);
                  }}
                  title={props.isCollapsed ? session.title : undefined}
                >
                  <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  {!props.isCollapsed ? (
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{session.title}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{session.modelName}</p>
                        </div>
                        <button
                          type="button"
                          className="rounded-md p-1 text-muted-foreground hover:bg-background/70 hover:text-foreground"
                          aria-label="Open session menu"
                          onClick={(event) => {
                            event.stopPropagation();
                            setMenuSessionId((currentValue) => currentValue === session.id ? null : session.id);
                          }}
                        >
                          <Ellipsis className="size-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{session.messageCount} messages</span>
                        <span>{formatTimestamp(session.updatedAt)}</span>
                        <span className={cn('h-2 w-2 rounded-full', sessionAction ? 'bg-amber-500' : session.modelLoaded ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
                      </div>
                    </div>
                  ) : null}
                </button>
                {!props.isCollapsed ? (
                  <SessionMenu
                    deletingSessionId={props.deletingSessionId}
                    isOpen={menuSessionId === session.id}
                    onClose={() => {
                      setMenuSessionId(null);
                    }}
                    onDeleteSession={props.onDeleteSession}
                    onLoadSessionModel={props.onLoadSessionModel}
                    onUnloadSessionModel={props.onUnloadSessionModel}
                    session={session}
                    sessionAction={sessionAction}
                  />
                ) : null}
              </div>
            );
          }) : (
            <div className={cn(
              'rounded-2xl border border-dashed border-border/70 bg-background/20 px-4 py-8 text-center',
              props.isCollapsed ? 'px-2' : ''
            )}>
              {!props.isCollapsed ? <p className="text-sm text-muted-foreground">No chat sessions yet.</p> : <MessageSquare className="mx-auto size-4 text-muted-foreground" />}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border/70 px-3 py-3">
        <NavLink
          to="/settings"
          className={({ isActive }) => cn(
            buttonVariants({ variant: isActive ? 'secondary' : 'ghost' }),
            'h-auto w-full min-w-0 justify-start gap-3 px-3 py-3 text-left',
            props.isCollapsed ? 'justify-center px-0' : ''
          )}
          onClick={() => {
            setMenuSessionId(null);
            props.onNavigateSystem();
          }}
          title={props.isCollapsed ? 'Settings & Runtime' : undefined}
        >
          <Settings className="size-4 shrink-0" />
          {!props.isCollapsed ? (
            <span className="min-w-0">
              <span className="block text-sm font-medium">Settings & Runtime</span>
              <span className="block text-xs text-muted-foreground">System controls and local runtime</span>
            </span>
          ) : null}
        </NavLink>
      </div>
    </aside>
  );
}

function AppShell(props: {
  activeChatSession: FoundryChatSessionDetailView | null;
  busyModelId: string | null;
  catalogModels: FoundryCatalogModelView[];
  chatDraftMessage: string;
  chatEligibleModels: FoundryCatalogModelView[];
  chatError: string | null;
  chatModelActionByModelId: Record<string, 'loading' | 'unloading'>;
  chatSessions: FoundryChatSessionView[];
  deletingChatSessionId: string | null;
  downloadProgressByModelId: Record<string, number>;
  epProgressByName: Record<string, number>;
  isCatalogLoading: boolean;
  isCatalogOpen: boolean;
  isChatSessionLoading: boolean;
  isCreatingChatSession: boolean;
  isRefreshingCatalog: boolean;
  isRegisteringEps: boolean;
  isRuntimeRefreshing: boolean;
  isSendingChatMessage: boolean;
  isWebServiceToggling: boolean;
  onCloseCatalog: () => void;
  onCreateChatSession: () => Promise<void>;
  onDeleteChatSession: (sessionId: string) => Promise<void>;
  onLoadChatSessionModel: (sessionId: string) => Promise<void>;
  onMutateCatalogModel: (modelId: string, action: FoundryCatalogAction) => Promise<void>;
  onOpenCatalog: () => void;
  onOpenChatSession: (sessionId: string) => Promise<void>;
  onRefreshCatalog: () => Promise<void>;
  onRefreshRuntime: () => Promise<void>;
  onRegisterExecutionProviders: (epName?: string) => Promise<void>;
  onSendChatMessage: () => Promise<void>;
  onSetChatDraftMessage: (value: string) => void;
  onToggleWebService: () => Promise<void>;
  onUnloadChatSessionModel: (sessionId: string) => Promise<void>;
  onUpdateChatSessionModel: (sessionId: string, modelId: string) => Promise<void>;
  runtime: FoundryRuntimeView;
  sidebarCollapsed: boolean;
  state: FoundryAppState;
  toggleSidebar: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [catalogReturnPath, setCatalogReturnPath] = useState('/settings');

  const openCatalog = () => {
    setCatalogReturnPath(location.pathname);
    props.onOpenCatalog();
    navigate('/settings');
  };

  const closeCatalog = () => {
    props.onCloseCatalog();
    navigate(catalogReturnPath);
  };

  useEffect(() => {
    if (location.pathname === '/') {
      navigate('/chat', { replace: true });
    }
  }, [location.pathname, navigate]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.15),_transparent_45%),linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)/0.45))] text-foreground transition-colors">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ChatSidebar
          activeSessionId={props.activeChatSession?.session.id ?? null}
          deletingSessionId={props.deletingChatSessionId}
          isCollapsed={props.sidebarCollapsed}
          isCreatingSession={props.isCreatingChatSession}
          modelActionByModelId={props.chatModelActionByModelId}
          onCreateSession={props.onCreateChatSession}
          onDeleteSession={props.onDeleteChatSession}
          onLoadSessionModel={props.onLoadChatSessionModel}
          onNavigateSystem={() => {
            navigate('/settings');
          }}
          onOpenSession={async (sessionId) => {
            await props.onOpenChatSession(sessionId);
            navigate('/chat');
          }}
          onToggleCollapse={props.toggleSidebar}
          onUnloadSessionModel={props.onUnloadChatSessionModel}
          sessions={props.chatSessions}
        />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {props.state.lastError ? (
            <div className="px-4 pt-4 sm:px-6">
              <div className="flex min-w-0 gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <div className="min-w-0">
                  <p className="font-medium">SDK bootstrap failed</p>
                  <p className="mt-1 break-words text-destructive/90">{props.state.lastError.message}</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <Routes>
              <Route
                path="/chat"
                element={
                  <ChatPage
                    activeSession={props.activeChatSession}
                    availableModels={props.chatEligibleModels}
                    chatError={props.chatError}
                    draftMessage={props.chatDraftMessage}
                    isCreatingSession={props.isCreatingChatSession}
                    isLoadingSession={props.isChatSessionLoading}
                    isSendingMessage={props.isSendingChatMessage}
                    modelActionByModelId={props.chatModelActionByModelId}
                    onLoadSessionModel={props.onLoadChatSessionModel}
                    onOpenCatalog={openCatalog}
                    onDraftMessageChange={props.onSetChatDraftMessage}
                    onSendMessage={props.onSendChatMessage}
                    onUnloadSessionModel={props.onUnloadChatSessionModel}
                    onUpdateSessionModel={props.onUpdateChatSessionModel}
                    sessions={props.chatSessions}
                    stateLoadedModelCount={props.state.loadedModelCount}
                  />
                }
              />
              <Route
                path="/settings"
                element={props.isCatalogOpen ? (
                  <CatalogPage
                    busyModelId={props.busyModelId}
                    downloadProgressByModelId={props.downloadProgressByModelId}
                    isLoading={props.isCatalogLoading}
                    isRefreshing={props.isRefreshingCatalog}
                    models={props.catalogModels}
                    onClose={closeCatalog}
                    onMutateModel={props.onMutateCatalogModel}
                    onRefresh={props.onRefreshCatalog}
                  />
                ) : (
                  <SettingsRuntimePage
                    epProgressByName={props.epProgressByName}
                    isCatalogOpen={props.isCatalogOpen}
                    isRegisteringEps={props.isRegisteringEps}
                    isRefreshing={props.isRuntimeRefreshing}
                    isTogglingWebService={props.isWebServiceToggling}
                    onOpenCatalog={openCatalog}
                    onRefresh={props.onRefreshRuntime}
                    onRegisterEp={props.onRegisterExecutionProviders}
                    onToggleWebService={props.onToggleWebService}
                    runtime={props.runtime}
                  />
                )}
              />
              <Route
                path="*"
                element={
                  <ChatPage
                    activeSession={props.activeChatSession}
                    availableModels={props.chatEligibleModels}
                    chatError={props.chatError}
                    draftMessage={props.chatDraftMessage}
                    isCreatingSession={props.isCreatingChatSession}
                    isLoadingSession={props.isChatSessionLoading}
                    isSendingMessage={props.isSendingChatMessage}
                    modelActionByModelId={props.chatModelActionByModelId}
                    onLoadSessionModel={props.onLoadChatSessionModel}
                    onOpenCatalog={openCatalog}
                    onDraftMessageChange={props.onSetChatDraftMessage}
                    onSendMessage={props.onSendChatMessage}
                    onUnloadSessionModel={props.onUnloadChatSessionModel}
                    onUpdateSessionModel={props.onUpdateChatSessionModel}
                    sessions={props.chatSessions}
                    stateLoadedModelCount={props.state.loadedModelCount}
                  />
                }
              />
            </Routes>
          </div>
        </main>
      </div>

      <StatusBar>
        <StatusBarContent>
          <StatusPill label="Bootstrap" value={props.state.bootstrapStage} tone={props.state.bootstrapStage} />
          <StatusPill label="SDK" value={props.state.sdkStage} tone={props.state.sdkStage} />
          <StatusPill label="Web service" value={props.state.webServiceStage} tone={props.state.webServiceStage} />
          <StatusPill label="Loaded models" value={String(props.state.loadedModelCount)} tone={props.state.loadedModelCount > 0 ? 'ready' : 'stopped'} />
        </StatusBarContent>
      </StatusBar>
    </div>
  );
}

export function App() {
  const [state, setState] = useState<FoundryAppState>(loadingState);
  const [catalogModels, setCatalogModels] = useState<FoundryCatalogModelView[]>([]);
  const [busyModelId, setBusyModelId] = useState<string | null>(null);
  const [downloadProgressByModelId, setDownloadProgressByModelId] = useState<Record<string, number>>({});
  const [runtime, setRuntime] = useState<FoundryRuntimeView>({ webServiceRunning: false, webServiceUrls: [], executionProviders: [] });
  const [epProgressByName, setEpProgressByName] = useState<Record<string, number>>({});
  const [chatSessions, setChatSessions] = useState<FoundryChatSessionView[]>([]);
  const [activeChatSession, setActiveChatSession] = useState<FoundryChatSessionDetailView | null>(null);
  const [chatDraftMessage, setChatDraftMessage] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [isRefreshingCatalog, setIsRefreshingCatalog] = useState(false);
  const [isRuntimeRefreshing, setIsRuntimeRefreshing] = useState(true);
  const [isWebServiceToggling, setIsWebServiceToggling] = useState(false);
  const [isRegisteringEps, setIsRegisteringEps] = useState(false);
  const [isChatSessionLoading, setIsChatSessionLoading] = useState(true);
  const [isCreatingChatSession, setIsCreatingChatSession] = useState(false);
  const [isSendingChatMessage, setIsSendingChatMessage] = useState(false);
  const [deletingChatSessionId, setDeletingChatSessionId] = useState<string | null>(null);
  const [chatModelActionByModelId, setChatModelActionByModelId] = useState<Record<string, 'loading' | 'unloading'>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const appApi = globalThis.window?.foundryLocalApp;

    if (!appApi || typeof appApi.getAppState !== 'function') {
      setState({
        ...loadingState,
        bootstrapStage: 'failed',
        sdkStage: 'failed',
        lastError: {
          message: 'The preload bridge is unavailable, so the renderer cannot query the Electron main process.'
        }
      });

      return () => {
        cancelled = true;
      };
    }

    void appApi.getAppState().then((nextState) => {
      if (!cancelled) {
        setState(nextState);
      }
    }).catch((error: unknown) => {
      if (!cancelled) {
        setState({
          ...loadingState,
          bootstrapStage: 'failed',
          sdkStage: 'failed',
          lastError: {
            message: error instanceof Error ? error.message : 'Failed to query app state over IPC'
          }
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const appApi = globalThis.window?.foundryLocalApp;

    if (!appApi || typeof appApi.getChatSessions !== 'function' || typeof appApi.getChatSession !== 'function') {
      setIsChatSessionLoading(false);

      return () => {
        cancelled = true;
      };
    }

    void appApi.getChatSessions().then(async (chatView) => {
      if (cancelled) {
        return;
      }

      setChatSessions(chatView.sessions);

      if (chatView.activeSessionId) {
        try {
          const sessionDetail = await appApi.getChatSession(chatView.activeSessionId);

          if (!cancelled) {
            setActiveChatSession(sessionDetail);
          }
        } catch (error) {
          if (!cancelled) {
            setChatError(error instanceof Error ? error.message : 'Failed to load the active chat session.');
          }
        }
      }

      if (!cancelled) {
        setIsChatSessionLoading(false);
      }
    }).catch((error: unknown) => {
      if (!cancelled) {
        setChatError(error instanceof Error ? error.message : 'Failed to load chat sessions.');
        setIsChatSessionLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const appApi = globalThis.window?.foundryLocalApp;

    if (!appApi || typeof appApi.getRuntime !== 'function') {
      setIsRuntimeRefreshing(false);

      return () => {
        cancelled = true;
      };
    }

    void appApi.getRuntime().then((nextRuntime) => {
      if (!cancelled) {
        setRuntime(nextRuntime);
        setIsRuntimeRefreshing(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setRuntime({ webServiceRunning: false, webServiceUrls: [], executionProviders: [] });
        setIsRuntimeRefreshing(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const appApi = globalThis.window?.foundryLocalApp;

    if (!appApi || typeof appApi.onCatalogDownloadProgress !== 'function') {
      return () => undefined;
    }

    return appApi.onCatalogDownloadProgress((progressEvent: FoundryDownloadProgressEvent) => {
      setDownloadProgressByModelId((currentValue) => ({
        ...currentValue,
        [progressEvent.modelId]: progressEvent.progress
      }));
    });
  }, []);

  useEffect(() => {
    const appApi = globalThis.window?.foundryLocalApp;

    if (!appApi || typeof appApi.onEpDownloadProgress !== 'function') {
      return () => undefined;
    }

    return appApi.onEpDownloadProgress((progressEvent: FoundryEpDownloadProgressEvent) => {
      setEpProgressByName((currentValue) => ({
        ...currentValue,
        [progressEvent.epName]: progressEvent.progress
      }));
    });
  }, []);

  useEffect(() => {
    const appApi = globalThis.window?.foundryLocalApp;

    if (!appApi || typeof appApi.onChatStreamEvent !== 'function') {
      return () => undefined;
    }

    return appApi.onChatStreamEvent((streamEvent: FoundryChatStreamEvent) => {
      setActiveChatSession((currentValue) => {
        if (!currentValue || currentValue.session.id !== streamEvent.sessionId) {
          return currentValue;
        }

        if (streamEvent.type === 'assistant-message-started') {
          if (currentValue.messages.some((message) => message.id === streamEvent.message.id)) {
            return currentValue;
          }

          return {
            session: {
              ...currentValue.session,
              updatedAt: streamEvent.message.createdAt,
              messageCount: currentValue.messages.length + 1
            },
            messages: [...currentValue.messages, streamEvent.message]
          };
        }

        if (streamEvent.type === 'assistant-message-delta') {
          return {
            session: {
              ...currentValue.session,
              updatedAt: new Date().toISOString()
            },
            messages: currentValue.messages.map((message) => message.id === streamEvent.messageId ? { ...message, content: message.content + streamEvent.delta } : message)
          };
        }

        if (streamEvent.type === 'assistant-message-completed') {
          return {
            session: {
              ...currentValue.session,
              lastResponseId: streamEvent.responseId,
              updatedAt: new Date().toISOString()
            },
            messages: currentValue.messages
          };
        }

        if (currentValue.messages.some((message) => message.id === streamEvent.message.id)) {
          return currentValue;
        }

        return {
          session: {
            ...currentValue.session,
            updatedAt: streamEvent.message.createdAt,
            messageCount: currentValue.messages.length + 1
          },
          messages: [...currentValue.messages, streamEvent.message]
        };
      });
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const appApi = globalThis.window?.foundryLocalApp;

    if (!appApi || typeof appApi.getCatalog !== 'function') {
      return () => {
        cancelled = true;
      };
    }

    void appApi.getCatalog().then((catalog) => {
      if (!cancelled) {
        setCatalogModels(catalog.models);
        setIsCatalogLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setCatalogModels([]);
        setIsCatalogLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshCatalog = async (): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;

    if (!appApi || typeof appApi.refreshCatalog !== 'function') {
      return;
    }

    setIsRefreshingCatalog(true);

    try {
      const catalog = await appApi.refreshCatalog();
      setCatalogModels(catalog.models);
      setDownloadProgressByModelId((currentValue) => {
        const nextValue = { ...currentValue };

        for (const model of catalog.models) {
          if (model.downloaded) {
            delete nextValue[model.id];
          }
        }

        return nextValue;
      });
    } finally {
      setIsRefreshingCatalog(false);
    }
  };

  const mutateCatalogModel = async (modelId: string, action: FoundryCatalogAction): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;

    if (!appApi || typeof appApi.mutateCatalogModel !== 'function') {
      return;
    }

    setBusyModelId(modelId);

    try {
      const catalog = await appApi.mutateCatalogModel(modelId, action);
      setCatalogModels(catalog.models);
      setDownloadProgressByModelId((currentValue) => {
        const nextValue = { ...currentValue };
        delete nextValue[modelId];
        return nextValue;
      });
      const nextState = await appApi.getAppState();
      setState(nextState);

      const chatView = await appApi.getChatSessions();
      setChatSessions(chatView.sessions);

      if (activeChatSession) {
        try {
          const sessionDetail = await appApi.getChatSession(activeChatSession.session.id);
          setActiveChatSession(sessionDetail);
        } catch {
          setActiveChatSession(null);
        }
      }
    } finally {
      setBusyModelId(null);
    }
  };

  const refreshRuntime = async (): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;

    if (!appApi || typeof appApi.getRuntime !== 'function' || typeof appApi.getAppState !== 'function') {
      return;
    }

    setIsRuntimeRefreshing(true);

    try {
      const [nextRuntime, nextState] = await Promise.all([appApi.getRuntime(), appApi.getAppState()]);
      setRuntime(nextRuntime);
      setState(nextState);
    } finally {
      setIsRuntimeRefreshing(false);
    }
  };

  const toggleWebService = async (): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;

    if (!appApi || typeof appApi.startWebService !== 'function' || typeof appApi.stopWebService !== 'function' || typeof appApi.getAppState !== 'function') {
      return;
    }

    setIsWebServiceToggling(true);

    try {
      const nextRuntime = runtime.webServiceRunning ? await appApi.stopWebService() : await appApi.startWebService();
      setRuntime(nextRuntime);
      const nextState = await appApi.getAppState();
      setState(nextState);
    } finally {
      setIsWebServiceToggling(false);
    }
  };

  const registerExecutionProviders = async (epName?: string): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;

    if (!appApi || typeof appApi.registerExecutionProviders !== 'function' || typeof appApi.getRuntime !== 'function') {
      return;
    }

    setIsRegisteringEps(true);

    try {
      await appApi.registerExecutionProviders(epName ? [epName] : undefined);
      const nextRuntime = await appApi.getRuntime();
      setRuntime(nextRuntime);
      setEpProgressByName((currentValue) => {
        const nextValue = { ...currentValue };

        for (const provider of nextRuntime.executionProviders) {
          if (provider.isRegistered) {
            delete nextValue[provider.name];
          }
        }

        return nextValue;
      });
    } finally {
      setIsRegisteringEps(false);
    }
  };

  const refreshModelState = async (): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;

    if (!appApi || typeof appApi.getCatalog !== 'function' || typeof appApi.getRuntime !== 'function' || typeof appApi.getAppState !== 'function') {
      return;
    }

    const [catalog, nextRuntime, nextState] = await Promise.all([
      appApi.getCatalog(),
      appApi.getRuntime(),
      appApi.getAppState()
    ]);

    setCatalogModels(catalog.models);
    setRuntime(nextRuntime);
    setState(nextState);
  };

  const openChatSession = async (sessionId: string): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;

    if (!appApi || typeof appApi.getChatSession !== 'function' || typeof appApi.getChatSessions !== 'function') {
      return;
    }

    setIsChatSessionLoading(true);
    setChatError(null);

    try {
      const [sessionDetail, chatView] = await Promise.all([appApi.getChatSession(sessionId), appApi.getChatSessions()]);
      setActiveChatSession(sessionDetail);
      setChatSessions(chatView.sessions);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Failed to open chat session.');
    } finally {
      setIsChatSessionLoading(false);
    }
  };

  const createChatSession = async (): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;
    const preferredModelId = activeChatSession?.session.modelId ?? chatEligibleModels[0]?.id;

    if (!preferredModelId || !appApi || typeof appApi.createChatSession !== 'function' || typeof appApi.getChatSessions !== 'function') {
      return;
    }

    setIsCreatingChatSession(true);
    setChatError(null);

    try {
      const sessionDetail = await appApi.createChatSession(preferredModelId);
      const chatView = await appApi.getChatSessions();
      setActiveChatSession(sessionDetail);
      setChatSessions(chatView.sessions);
      setChatDraftMessage('');
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Failed to create chat session.');
    } finally {
      setIsCreatingChatSession(false);
    }
  };

  const updateChatSessionModel = async (sessionId: string, modelId: string): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;

    if (!sessionId || !appApi || typeof appApi.updateChatSessionModel !== 'function' || typeof appApi.getChatSessions !== 'function') {
      return;
    }

    setChatError(null);

    try {
      const sessionDetail = await appApi.updateChatSessionModel(sessionId, modelId);
      const chatView = await appApi.getChatSessions();
      setActiveChatSession(sessionDetail);
      setChatSessions(chatView.sessions);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Failed to update chat session model.');
    }
  };

  const sendChatMessage = async (): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;

    if (!activeChatSession || !appApi || typeof appApi.sendChatMessage !== 'function' || typeof appApi.getChatSessions !== 'function' || !chatDraftMessage.trim()) {
      return;
    }

    const nextDraftMessage = chatDraftMessage;

    setIsSendingChatMessage(true);
    setChatError(null);
    setChatDraftMessage('');

    const optimisticUserMessage: FoundryChatMessageView = {
      id: `optimistic-${Date.now()}`,
      role: 'user',
      content: nextDraftMessage,
      createdAt: new Date().toISOString()
    };

    setActiveChatSession((currentValue) => currentValue ? {
      session: {
        ...currentValue.session,
        updatedAt: optimisticUserMessage.createdAt,
        messageCount: currentValue.messages.length + 1
      },
      messages: [...currentValue.messages, optimisticUserMessage]
    } : currentValue);

    try {
      const result = await appApi.sendChatMessage(activeChatSession.session.id, nextDraftMessage);
      const chatView = await appApi.getChatSessions();
      setActiveChatSession(result.session);
      setChatSessions(chatView.sessions);
    } catch (error) {
      setActiveChatSession((currentValue) => currentValue ? {
        session: {
          ...currentValue.session,
          updatedAt: currentValue.session.updatedAt,
          messageCount: Math.max(0, currentValue.messages.filter((message) => message.id !== optimisticUserMessage.id).length)
        },
        messages: currentValue.messages.filter((message) => message.id !== optimisticUserMessage.id)
      } : currentValue);
      setChatDraftMessage(nextDraftMessage);
      setChatError(error instanceof Error ? error.message : 'Failed to send chat message.');
    } finally {
      setIsSendingChatMessage(false);
    }
  };

  const loadChatSessionModel = async (sessionId: string): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;
    const session = chatSessions.find((entry) => entry.id === sessionId);

    if (!session || !appApi || typeof appApi.loadChatSessionModel !== 'function') {
      return;
    }

    setChatModelActionByModelId((currentValue) => ({
      ...currentValue,
      [session.modelId]: 'loading'
    }));
    setChatError(null);

    try {
      const chatView = await appApi.loadChatSessionModel(sessionId);
      setChatSessions(chatView.sessions);
      await refreshModelState();
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Failed to load session model.');
    } finally {
      setChatModelActionByModelId((currentValue) => {
        const nextValue = { ...currentValue };
        delete nextValue[session.modelId];
        return nextValue;
      });
    }
  };

  const unloadChatSessionModel = async (sessionId: string): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;
    const session = chatSessions.find((entry) => entry.id === sessionId);

    if (!session || !appApi || typeof appApi.unloadChatSessionModel !== 'function') {
      return;
    }

    setChatModelActionByModelId((currentValue) => ({
      ...currentValue,
      [session.modelId]: 'unloading'
    }));
    setChatError(null);

    try {
      const chatView = await appApi.unloadChatSessionModel(sessionId);
      setChatSessions(chatView.sessions);
      await refreshModelState();
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Failed to unload session model.');
    } finally {
      setChatModelActionByModelId((currentValue) => {
        const nextValue = { ...currentValue };
        delete nextValue[session.modelId];
        return nextValue;
      });
    }
  };

  const deleteChatSession = async (sessionId: string): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;

    if (!appApi || typeof appApi.deleteChatSession !== 'function' || typeof appApi.getChatSession !== 'function') {
      return;
    }

    setDeletingChatSessionId(sessionId);
    setChatError(null);

    try {
      const chatView = await appApi.deleteChatSession(sessionId);
      setChatSessions(chatView.sessions);

      if (activeChatSession?.session.id === sessionId) {
        if (chatView.activeSessionId) {
          const nextSessionDetail = await appApi.getChatSession(chatView.activeSessionId);
          setActiveChatSession(nextSessionDetail);
        } else {
          setActiveChatSession(null);
        }
      }
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Failed to delete chat session.');
    } finally {
      setDeletingChatSessionId(null);
    }
  };

  const downloadedModels = useMemo(() => catalogModels.filter((model) => model.downloaded), [catalogModels]);
  const chatEligibleModels = useMemo(() => downloadedModels.filter((model) => model.supportsTextChat), [downloadedModels]);

  return (
    <AppShell
      activeChatSession={activeChatSession}
      busyModelId={busyModelId}
      catalogModels={catalogModels}
      chatDraftMessage={chatDraftMessage}
      chatEligibleModels={chatEligibleModels}
      chatError={chatError}
      chatModelActionByModelId={chatModelActionByModelId}
      chatSessions={chatSessions}
      deletingChatSessionId={deletingChatSessionId}
      downloadProgressByModelId={downloadProgressByModelId}
      epProgressByName={epProgressByName}
      isCatalogLoading={isCatalogLoading}
      isCatalogOpen={isCatalogOpen}
      isChatSessionLoading={isChatSessionLoading}
      isCreatingChatSession={isCreatingChatSession}
      isRefreshingCatalog={isRefreshingCatalog}
      isRegisteringEps={isRegisteringEps}
      isRuntimeRefreshing={isRuntimeRefreshing}
      isSendingChatMessage={isSendingChatMessage}
      isWebServiceToggling={isWebServiceToggling}
      onCloseCatalog={() => {
        setIsCatalogOpen(false);
      }}
      onCreateChatSession={createChatSession}
      onDeleteChatSession={deleteChatSession}
      onLoadChatSessionModel={loadChatSessionModel}
      onMutateCatalogModel={mutateCatalogModel}
      onOpenCatalog={() => {
        setIsCatalogOpen(true);
      }}
      onOpenChatSession={openChatSession}
      onRefreshCatalog={refreshCatalog}
      onRefreshRuntime={refreshRuntime}
      onRegisterExecutionProviders={registerExecutionProviders}
      onSendChatMessage={sendChatMessage}
      onSetChatDraftMessage={setChatDraftMessage}
      onToggleWebService={toggleWebService}
      onUnloadChatSessionModel={unloadChatSessionModel}
      onUpdateChatSessionModel={updateChatSessionModel}
      runtime={runtime}
      sidebarCollapsed={sidebarCollapsed}
      state={state}
      toggleSidebar={() => {
        setSidebarCollapsed((currentValue) => !currentValue);
      }}
    />
  );
}
