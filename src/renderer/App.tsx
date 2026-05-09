import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Ellipsis, LoaderCircle, MessageSquare, Mic, PanelLeftClose, PanelLeftOpen, Play, Plus, Settings, Trash2, XCircle } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { StatusBar, StatusBarContent } from '@/components/ui/status-bar';
import { cn } from '@/lib/utils';
import type {
  FoundryAppState,
  FoundryAudioSettingsInput,
  FoundryAudioSettingsView,
  FoundryCatalogAction,
  FoundryCatalogModelView,
  FoundryChatMessageView,
  FoundryChatSessionDetailView,
  FoundryChatSessionView,
  FoundryChatStreamEvent,
  FoundryDownloadProgressEvent,
  FoundryEpDownloadProgressEvent,
  FoundryRuntimeView,
  FoundryTranscriptSessionDetailView,
  FoundryTranscriptSessionView,
  FoundryTranscriptStreamEvent
} from '../shared/foundry-state.js';
import { CatalogPage } from './pages/catalog-page';
import { ChatPage } from './pages/chat-page';
import { SettingsRuntimePage } from './pages/settings-runtime-page';
import { formatTimestamp } from './pages/shared';
import { TranscriptPage } from './pages/transcript-page';

const loadingState: FoundryAppState = {
  bootstrapStage: 'starting',
  sdkStage: 'initializing',
  webServiceStage: 'stopped',
  loadedModelCount: 0,
  startupConfigSummary: 'Loading startup configuration...',
  webServiceUrls: [],
  lastError: null
};

const emptyAudioSettings: FoundryAudioSettingsView = {
  selectedInputDeviceId: null,
  sampleRate: 16000,
  channels: 1,
  bitsPerSample: 16,
  language: 'en',
  availableInputDevices: [],
  deviceAccessError: null
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

type SidebarSession = {
  id: string;
  title: string;
  modelId: string;
  modelName: string;
  updatedAt: string;
  detailCountLabel: string;
  modelLoaded: boolean;
  isLive: boolean;
  icon: 'chat' | 'transcript';
};

type SidebarGroupValue = 'chat' | 'transcript';

function SidebarSessionMenu(props: {
  deletingSessionId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onLoadSessionModel: (sessionId: string) => Promise<void>;
  onUnloadSessionModel: (sessionId: string) => Promise<void>;
  session: SidebarSession;
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

function HistoryGroup(props: {
  activeSessionId: string | null;
  collapsed: boolean;
  contentClassName?: string;
  deletingSessionId: string | null;
  emptyLabel: string;
  icon: 'chat' | 'transcript';
  isCreatingSession: boolean;
  itemClassName?: string;
  label: string;
  modelActionByModelId: Record<string, 'loading' | 'unloading'>;
  onCreateSession: () => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onLoadSessionModel: (sessionId: string) => Promise<void>;
  onOpenSession: (sessionId: string) => Promise<void>;
  onUnloadSessionModel: (sessionId: string) => Promise<void>;
  sessions: SidebarSession[];
  value: string;
}) {
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);
  const groupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!props.sessions.some((session) => session.id === menuSessionId)) {
      setMenuSessionId(null);
    }
  }, [menuSessionId, props.sessions]);

  useEffect(() => {
    if (!menuSessionId) {
      return () => undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (!groupRef.current?.contains(event.target)) {
        setMenuSessionId(null);
      }
    };

    globalThis.document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      globalThis.document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [menuSessionId]);

  const Icon = props.icon === 'chat' ? MessageSquare : Mic;
  const content = (
    <div className="space-y-2">
      {props.sessions.length > 0 ? props.sessions.map((session) => {
        const isActive = props.activeSessionId === session.id;
        const sessionAction = props.modelActionByModelId[session.modelId];
        const SessionIcon = session.icon === 'chat' ? MessageSquare : Mic;

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
              title={props.collapsed ? session.title : undefined}
            >
              <SessionIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              {!props.collapsed ? (
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
                    <span>{session.detailCountLabel}</span>
                    <span>{formatTimestamp(session.updatedAt)}</span>
                    {session.isLive ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">Live</span> : null}
                    <span className={cn('h-2 w-2 rounded-full', sessionAction ? 'bg-amber-500' : session.modelLoaded ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
                  </div>
                </div>
              ) : null}
            </button>
            {!props.collapsed ? (
              <SidebarSessionMenu
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
          props.collapsed ? 'px-2' : ''
        )}>
          {!props.collapsed ? <p className="text-sm text-muted-foreground">{props.emptyLabel}</p> : <Icon className="mx-auto size-4 text-muted-foreground" />}
        </div>
      )}
    </div>
  );

  return (
    <AccordionItem value={props.value} className={cn('space-y-2', props.itemClassName)}>
      <div ref={groupRef}>
        <div className={cn('flex items-center gap-2', props.collapsed ? 'justify-center' : 'justify-between')}>
          <AccordionTrigger
            className={cn(
              'flex min-w-0 items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-medium transition-colors hover:bg-accent/70',
              props.collapsed ? 'justify-center px-0' : 'flex-1'
            )}
            title={props.collapsed ? props.label : undefined}
          >
            {!props.collapsed ? (
              <div className="text-muted-foreground">
                <ChevronRight className="size-4 data-[state=open]:hidden" />
                <ChevronDown className="hidden size-4 data-[state=open]:block" />
              </div>
            ) : null}
            <Icon className="size-4 shrink-0 text-primary" />
            {!props.collapsed ? <span className="truncate">{props.label}</span> : null}
          </AccordionTrigger>
          <Button type="button" variant="ghost" size="icon" aria-label={`Create ${props.label.toLowerCase()} session`} disabled={props.isCreatingSession} onClick={() => {
            void props.onCreateSession();
          }}>
            {props.isCreatingSession ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
          </Button>
        </div>

        <AccordionContent className={props.contentClassName}>{content}</AccordionContent>
      </div>
    </AccordionItem>
  );
}

function AppSidebar(props: {
  activeChatSessionId: string | null;
  activeTranscriptSessionId: string | null;
  chatModelActionByModelId: Record<string, 'loading' | 'unloading'>;
  chatSessions: FoundryChatSessionView[];
  deletingChatSessionId: string | null;
  deletingTranscriptSessionId: string | null;
  isCollapsed: boolean;
  isCreatingChatSession: boolean;
  isCreatingTranscriptSession: boolean;
  onCreateChatSession: () => Promise<void>;
  onCreateTranscriptSession: () => Promise<void>;
  onDeleteChatSession: (sessionId: string) => Promise<void>;
  onDeleteTranscriptSession: (sessionId: string) => Promise<void>;
  onLoadChatSessionModel: (sessionId: string) => Promise<void>;
  onLoadTranscriptSessionModel: (sessionId: string) => Promise<void>;
  onNavigateSystem: () => void;
  onOpenChatSession: (sessionId: string) => Promise<void>;
  onOpenTranscriptSession: (sessionId: string) => Promise<void>;
  onSelectGroup: (group: SidebarGroupValue) => Promise<void>;
  onToggleCollapse: () => void;
  onUnloadChatSessionModel: (sessionId: string) => Promise<void>;
  onUnloadTranscriptSessionModel: (sessionId: string) => Promise<void>;
  routeGroup: SidebarGroupValue | null;
  transcriptModelActionByModelId: Record<string, 'loading' | 'unloading'>;
  transcriptSessions: FoundryTranscriptSessionView[];
}) {
  const [expandedGroup, setExpandedGroup] = useState<SidebarGroupValue>('chat');

  const chatSidebarSessions: SidebarSession[] = props.chatSessions.map((session) => ({
    id: session.id,
    title: session.title,
    modelId: session.modelId,
    modelName: session.modelName,
    updatedAt: session.updatedAt,
    detailCountLabel: `${session.messageCount} messages`,
    modelLoaded: session.modelLoaded,
    isLive: false,
    icon: 'chat'
  }));

  const transcriptSidebarSessions: SidebarSession[] = props.transcriptSessions.map((session) => ({
    id: session.id,
    title: session.title,
    modelId: session.modelId,
    modelName: session.modelName,
    updatedAt: session.updatedAt,
    detailCountLabel: `${session.entryCount} entries`,
    modelLoaded: session.modelLoaded,
    isLive: session.isTranscribing,
    icon: 'transcript'
  }));

  const transcriptExpanded = expandedGroup === 'transcript';

  useEffect(() => {
    if (props.routeGroup) {
      setExpandedGroup(props.routeGroup);
    }
  }, [props.routeGroup]);

  const handleGroupChange = (nextValue: string | null) => {
    if (!nextValue || nextValue === expandedGroup) {
      return;
    }

    const nextGroup = nextValue as SidebarGroupValue;
    setExpandedGroup(nextGroup);
    void props.onSelectGroup(nextGroup);
  };

  return (
    <aside className={cn(
      'relative flex h-full min-w-0 flex-col border-r border-border/70 bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/80 transition-[width] duration-200',
      props.isCollapsed ? 'w-[76px]' : 'w-[320px]'
    )}>
      <div className="flex items-center justify-between px-3 pt-3">
        <Button type="button" variant="ghost" size="icon" aria-label={props.isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={props.onToggleCollapse}>
          {props.isCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </Button>
        {!props.isCollapsed ? <p className="text-sm font-medium text-muted-foreground">Sessions</p> : null}
        <div className="w-9" />
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-4">
        <Accordion type="single" value={expandedGroup} onValueChange={handleGroupChange} className="flex min-h-full flex-col gap-4">
          <HistoryGroup
            activeSessionId={props.activeChatSessionId}
            collapsed={props.isCollapsed}
            deletingSessionId={props.deletingChatSessionId}
            emptyLabel="No chat sessions yet."
            icon="chat"
            isCreatingSession={props.isCreatingChatSession}
            label="Chat"
            modelActionByModelId={props.chatModelActionByModelId}
            onCreateSession={props.onCreateChatSession}
            onDeleteSession={props.onDeleteChatSession}
            onLoadSessionModel={props.onLoadChatSessionModel}
            onOpenSession={props.onOpenChatSession}
            onUnloadSessionModel={props.onUnloadChatSessionModel}
            sessions={chatSidebarSessions}
            value="chat"
          />
          {!transcriptExpanded ? <div className="flex-1" /> : null}
          <HistoryGroup
            activeSessionId={props.activeTranscriptSessionId}
            collapsed={props.isCollapsed}
            contentClassName={transcriptExpanded ? 'min-h-0 flex-1' : undefined}
            deletingSessionId={props.deletingTranscriptSessionId}
            emptyLabel="No transcript sessions yet."
            icon="transcript"
            isCreatingSession={props.isCreatingTranscriptSession}
            itemClassName={transcriptExpanded ? 'min-h-0 flex-1' : undefined}
            label="Transcript"
            modelActionByModelId={props.transcriptModelActionByModelId}
            onCreateSession={props.onCreateTranscriptSession}
            onDeleteSession={props.onDeleteTranscriptSession}
            onLoadSessionModel={props.onLoadTranscriptSessionModel}
            onOpenSession={props.onOpenTranscriptSession}
            onUnloadSessionModel={props.onUnloadTranscriptSessionModel}
            sessions={transcriptSidebarSessions}
            value="transcript"
          />
        </Accordion>
      </div>

      <div className="border-t border-border/70 px-3 py-3">
        <NavLink
          to="/settings"
          className={({ isActive }) => cn(
            buttonVariants({ variant: isActive ? 'secondary' : 'ghost' }),
            'h-auto w-full min-w-0 justify-start gap-3 px-3 py-3 text-left',
            props.isCollapsed ? 'justify-center px-0' : ''
          )}
          onClick={props.onNavigateSystem}
          title={props.isCollapsed ? 'Settings & Runtime' : undefined}
        >
          <Settings className="size-4 shrink-0" />
          {!props.isCollapsed ? (
            <span className="min-w-0">
              <span className="block text-sm font-medium">Settings & Runtime</span>
              <span className="block text-xs text-muted-foreground">System controls, audio, and local runtime</span>
            </span>
          ) : null}
        </NavLink>
      </div>
    </aside>
  );
}

function AppShell(props: {
  activeChatSession: FoundryChatSessionDetailView | null;
  activeTranscriptSession: FoundryTranscriptSessionDetailView | null;
  audioSettings: FoundryAudioSettingsView;
  busyModelId: string | null;
  catalogModels: FoundryCatalogModelView[];
  chatDraftMessage: string;
  chatEligibleModels: FoundryCatalogModelView[];
  chatError: string | null;
  chatModelActionByModelId: Record<string, 'loading' | 'unloading'>;
  chatSessions: FoundryChatSessionView[];
  deletingChatSessionId: string | null;
  deletingTranscriptSessionId: string | null;
  downloadProgressByModelId: Record<string, number>;
  epProgressByName: Record<string, number>;
  isCatalogLoading: boolean;
  isCatalogOpen: boolean;
  isChatSessionLoading: boolean;
  isCreatingChatSession: boolean;
  isCreatingTranscriptSession: boolean;
  isRefreshingCatalog: boolean;
  isRegisteringEps: boolean;
  isRuntimeRefreshing: boolean;
  isSavingAudioSettings: boolean;
  isSendingChatMessage: boolean;
  isStartingTranscript: boolean;
  isStoppingTranscript: boolean;
  isTranscriptSessionLoading: boolean;
  isWebServiceToggling: boolean;
  onCloseCatalog: () => void;
  onCreateChatSession: () => Promise<void>;
  onCreateTranscriptSession: () => Promise<void>;
  onDeleteChatSession: (sessionId: string) => Promise<void>;
  onDeleteTranscriptSession: (sessionId: string) => Promise<void>;
  onLoadChatSessionModel: (sessionId: string) => Promise<void>;
  onLoadTranscriptSessionModel: (sessionId: string) => Promise<void>;
  onMutateCatalogModel: (modelId: string, action: FoundryCatalogAction) => Promise<void>;
  onOpenCatalog: () => void;
  onOpenChatSession: (sessionId: string) => Promise<void>;
  onOpenTranscriptSession: (sessionId: string) => Promise<void>;
  onRefreshCatalog: () => Promise<void>;
  onRefreshRuntime: () => Promise<void>;
  onRegisterExecutionProviders: (epName?: string) => Promise<void>;
  onSaveAudioSettings: (settings: FoundryAudioSettingsInput) => Promise<void>;
  onSendChatMessage: () => Promise<void>;
  onSetChatDraftMessage: (value: string) => void;
  onStartTranscript: () => Promise<void>;
  onStopTranscript: () => Promise<void>;
  onToggleWebService: () => Promise<void>;
  onUnloadChatSessionModel: (sessionId: string) => Promise<void>;
  onUnloadTranscriptSessionModel: (sessionId: string) => Promise<void>;
  onUpdateChatSessionModel: (sessionId: string, modelId: string) => Promise<void>;
  onUpdateTranscriptSessionModel: (sessionId: string, modelId: string) => Promise<void>;
  runtime: FoundryRuntimeView;
  sidebarCollapsed: boolean;
  state: FoundryAppState;
  toggleSidebar: () => void;
  transcriptEligibleModels: FoundryCatalogModelView[];
  transcriptError: string | null;
  transcriptModelActionByModelId: Record<string, 'loading' | 'unloading'>;
  transcriptPreviewText: string;
  transcriptSessions: FoundryTranscriptSessionView[];
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [catalogReturnPath, setCatalogReturnPath] = useState('/settings');
  const routeGroup: SidebarGroupValue | null = location.pathname === '/transcript'
    ? 'transcript'
    : location.pathname === '/chat' || location.pathname === '/'
      ? 'chat'
      : null;

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
        <AppSidebar
          activeChatSessionId={props.activeChatSession?.session.id ?? null}
          activeTranscriptSessionId={props.activeTranscriptSession?.session.id ?? null}
          chatModelActionByModelId={props.chatModelActionByModelId}
          chatSessions={props.chatSessions}
          deletingChatSessionId={props.deletingChatSessionId}
          deletingTranscriptSessionId={props.deletingTranscriptSessionId}
          isCollapsed={props.sidebarCollapsed}
          isCreatingChatSession={props.isCreatingChatSession}
          isCreatingTranscriptSession={props.isCreatingTranscriptSession}
          onCreateChatSession={props.onCreateChatSession}
          onCreateTranscriptSession={props.onCreateTranscriptSession}
          onDeleteChatSession={props.onDeleteChatSession}
          onDeleteTranscriptSession={props.onDeleteTranscriptSession}
          onLoadChatSessionModel={props.onLoadChatSessionModel}
          onLoadTranscriptSessionModel={props.onLoadTranscriptSessionModel}
          onNavigateSystem={() => {
            navigate('/settings');
          }}
          onOpenChatSession={async (sessionId) => {
            await props.onOpenChatSession(sessionId);
            navigate('/chat');
          }}
          onOpenTranscriptSession={async (sessionId) => {
            await props.onOpenTranscriptSession(sessionId);
            navigate('/transcript');
          }}
          onSelectGroup={async (group) => {
            if (group === 'chat') {
              const firstSession = props.chatSessions[0];

              if (firstSession) {
                await props.onOpenChatSession(firstSession.id);
              }

              navigate('/chat');
              return;
            }

            const firstSession = props.transcriptSessions[0];

            if (firstSession) {
              await props.onOpenTranscriptSession(firstSession.id);
            }

            navigate('/transcript');
          }}
          onToggleCollapse={props.toggleSidebar}
          onUnloadChatSessionModel={props.onUnloadChatSessionModel}
          onUnloadTranscriptSessionModel={props.onUnloadTranscriptSessionModel}
          routeGroup={routeGroup}
          transcriptModelActionByModelId={props.transcriptModelActionByModelId}
          transcriptSessions={props.transcriptSessions}
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
                path="/transcript"
                element={
                  <TranscriptPage
                    activeSession={props.activeTranscriptSession}
                    availableModels={props.transcriptEligibleModels}
                    isCreatingSession={props.isCreatingTranscriptSession}
                    isLoadingSession={props.isTranscriptSessionLoading}
                    isStartingTranscription={props.isStartingTranscript}
                    isStoppingTranscription={props.isStoppingTranscript}
                    modelActionByModelId={props.transcriptModelActionByModelId}
                    onLoadSessionModel={props.onLoadTranscriptSessionModel}
                    onOpenCatalog={openCatalog}
                    onStartTranscription={props.onStartTranscript}
                    onStopTranscription={props.onStopTranscript}
                    onUnloadSessionModel={props.onUnloadTranscriptSessionModel}
                    onUpdateSessionModel={props.onUpdateTranscriptSessionModel}
                    previewText={props.transcriptPreviewText}
                    sessions={props.transcriptSessions}
                    stateLoadedModelCount={props.state.loadedModelCount}
                    transcriptError={props.transcriptError}
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
                    audioSettings={props.audioSettings}
                    epProgressByName={props.epProgressByName}
                    isCatalogOpen={props.isCatalogOpen}
                    isRegisteringEps={props.isRegisteringEps}
                    isRefreshing={props.isRuntimeRefreshing}
                    isSavingAudioSettings={props.isSavingAudioSettings}
                    isTogglingWebService={props.isWebServiceToggling}
                    onOpenCatalog={openCatalog}
                    onRefresh={props.onRefreshRuntime}
                    onRegisterEp={props.onRegisterExecutionProviders}
                    onSaveAudioSettings={props.onSaveAudioSettings}
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
  const [audioSettings, setAudioSettings] = useState<FoundryAudioSettingsView>(emptyAudioSettings);
  const [epProgressByName, setEpProgressByName] = useState<Record<string, number>>({});
  const [chatSessions, setChatSessions] = useState<FoundryChatSessionView[]>([]);
  const [activeChatSession, setActiveChatSession] = useState<FoundryChatSessionDetailView | null>(null);
  const [chatDraftMessage, setChatDraftMessage] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [transcriptSessions, setTranscriptSessions] = useState<FoundryTranscriptSessionView[]>([]);
  const [activeTranscriptSession, setActiveTranscriptSession] = useState<FoundryTranscriptSessionDetailView | null>(null);
  const [transcriptPreviewText, setTranscriptPreviewText] = useState('');
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [isRefreshingCatalog, setIsRefreshingCatalog] = useState(false);
  const [isRuntimeRefreshing, setIsRuntimeRefreshing] = useState(true);
  const [isSavingAudioSettings, setIsSavingAudioSettings] = useState(false);
  const [isWebServiceToggling, setIsWebServiceToggling] = useState(false);
  const [isRegisteringEps, setIsRegisteringEps] = useState(false);
  const [isChatSessionLoading, setIsChatSessionLoading] = useState(true);
  const [isCreatingChatSession, setIsCreatingChatSession] = useState(false);
  const [isSendingChatMessage, setIsSendingChatMessage] = useState(false);
  const [deletingChatSessionId, setDeletingChatSessionId] = useState<string | null>(null);
  const [chatModelActionByModelId, setChatModelActionByModelId] = useState<Record<string, 'loading' | 'unloading'>>({});
  const [isTranscriptSessionLoading, setIsTranscriptSessionLoading] = useState(true);
  const [isCreatingTranscriptSession, setIsCreatingTranscriptSession] = useState(false);
  const [isStartingTranscript, setIsStartingTranscript] = useState(false);
  const [isStoppingTranscript, setIsStoppingTranscript] = useState(false);
  const [deletingTranscriptSessionId, setDeletingTranscriptSessionId] = useState<string | null>(null);
  const [transcriptModelActionByModelId, setTranscriptModelActionByModelId] = useState<Record<string, 'loading' | 'unloading'>>({});
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

    if (!appApi || typeof appApi.getTranscriptSessions !== 'function' || typeof appApi.getTranscriptSession !== 'function') {
      setIsTranscriptSessionLoading(false);

      return () => {
        cancelled = true;
      };
    }

    void appApi.getTranscriptSessions().then(async (transcriptView) => {
      if (cancelled) {
        return;
      }

      setTranscriptSessions(transcriptView.sessions);

      if (transcriptView.activeSessionId) {
        try {
          const sessionDetail = await appApi.getTranscriptSession(transcriptView.activeSessionId);

          if (!cancelled) {
            setActiveTranscriptSession(sessionDetail);
          }
        } catch (error) {
          if (!cancelled) {
            setTranscriptError(error instanceof Error ? error.message : 'Failed to load the active transcript session.');
          }
        }
      }

      if (!cancelled) {
        setIsTranscriptSessionLoading(false);
      }
    }).catch((error: unknown) => {
      if (!cancelled) {
        setTranscriptError(error instanceof Error ? error.message : 'Failed to load transcript sessions.');
        setIsTranscriptSessionLoading(false);
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
    let cancelled = false;

    const appApi = globalThis.window?.foundryLocalApp;

    if (!appApi || typeof appApi.getAudioSettings !== 'function') {
      return () => {
        cancelled = true;
      };
    }

    void appApi.getAudioSettings().then((nextAudioSettings) => {
      if (!cancelled) {
        setAudioSettings(nextAudioSettings);
      }
    }).catch((error: unknown) => {
      if (!cancelled) {
        setAudioSettings({
          ...emptyAudioSettings,
          deviceAccessError: error instanceof Error ? error.message : 'Failed to load audio settings.'
        });
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
    const appApi = globalThis.window?.foundryLocalApp;

    if (!appApi || typeof appApi.onTranscriptStreamEvent !== 'function') {
      return () => undefined;
    }

    return appApi.onTranscriptStreamEvent((streamEvent: FoundryTranscriptStreamEvent) => {
      if (streamEvent.type === 'transcription-preview-updated') {
        if (activeTranscriptSession?.session.id === streamEvent.sessionId) {
          setTranscriptPreviewText(streamEvent.preview);
        }

        return;
      }

      if (streamEvent.type === 'transcription-started') {
        setTranscriptSessions((currentValue) => currentValue.map((session) => session.id === streamEvent.sessionId ? { ...session, isTranscribing: true } : { ...session, isTranscribing: false }));
        return;
      }

      if (streamEvent.type === 'transcription-entry-committed') {
        setActiveTranscriptSession((currentValue) => {
          if (!currentValue || currentValue.session.id !== streamEvent.sessionId) {
            return currentValue;
          }

          return {
            session: {
              ...currentValue.session,
              updatedAt: streamEvent.entry.createdAt,
              entryCount: currentValue.entries.length + 1
            },
            entries: [...currentValue.entries, streamEvent.entry]
          };
        });
        setTranscriptSessions((currentValue) => currentValue.map((session) => session.id === streamEvent.sessionId ? {
          ...session,
          updatedAt: streamEvent.entry.createdAt,
          entryCount: session.entryCount + 1
        } : session));
        return;
      }

      if (streamEvent.type === 'transcription-stopped') {
        setTranscriptPreviewText('');
        setTranscriptSessions((currentValue) => currentValue.map((session) => session.id === streamEvent.sessionId ? { ...session, isTranscribing: false } : session));
        return;
      }

      if (streamEvent.type === 'transcription-failed') {
        setTranscriptError(streamEvent.message);
        setTranscriptPreviewText('');
      }
    });
  }, [activeTranscriptSession?.session.id]);

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

  const refreshChatSessions = async (): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;

    if (!appApi || typeof appApi.getChatSessions !== 'function') {
      return;
    }

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
  };

  const refreshTranscriptSessions = async (): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;

    if (!appApi || typeof appApi.getTranscriptSessions !== 'function') {
      return;
    }

    const transcriptView = await appApi.getTranscriptSessions();
    setTranscriptSessions(transcriptView.sessions);

    if (activeTranscriptSession) {
      try {
        const sessionDetail = await appApi.getTranscriptSession(activeTranscriptSession.session.id);
        setActiveTranscriptSession(sessionDetail);
      } catch {
        setActiveTranscriptSession(null);
      }
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
      await Promise.all([refreshChatSessions(), refreshTranscriptSessions()]);
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

  const saveAudioSettings = async (settings: FoundryAudioSettingsInput): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;

    if (!appApi || typeof appApi.updateAudioSettings !== 'function') {
      return;
    }

    setIsSavingAudioSettings(true);
    setTranscriptError(null);

    try {
      const nextAudioSettings = await appApi.updateAudioSettings(settings);
      setAudioSettings(nextAudioSettings);
    } catch (error) {
      setTranscriptError(error instanceof Error ? error.message : 'Failed to update audio settings.');
    } finally {
      setIsSavingAudioSettings(false);
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

  const openTranscriptSession = async (sessionId: string): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;

    if (!appApi || typeof appApi.getTranscriptSession !== 'function' || typeof appApi.getTranscriptSessions !== 'function') {
      return;
    }

    setIsTranscriptSessionLoading(true);
    setTranscriptError(null);

    try {
      const [sessionDetail, transcriptView] = await Promise.all([appApi.getTranscriptSession(sessionId), appApi.getTranscriptSessions()]);
      setActiveTranscriptSession(sessionDetail);
      setTranscriptSessions(transcriptView.sessions);
      setTranscriptPreviewText('');
    } catch (error) {
      setTranscriptError(error instanceof Error ? error.message : 'Failed to open transcript session.');
    } finally {
      setIsTranscriptSessionLoading(false);
    }
  };

  const createTranscriptSession = async (): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;
    const preferredModelId = activeTranscriptSession?.session.modelId ?? transcriptEligibleModels[0]?.id;

    if (!preferredModelId || !appApi || typeof appApi.createTranscriptSession !== 'function' || typeof appApi.getTranscriptSessions !== 'function') {
      return;
    }

    setIsCreatingTranscriptSession(true);
    setTranscriptError(null);

    try {
      const sessionDetail = await appApi.createTranscriptSession(preferredModelId);
      const transcriptView = await appApi.getTranscriptSessions();
      setActiveTranscriptSession(sessionDetail);
      setTranscriptSessions(transcriptView.sessions);
      setTranscriptPreviewText('');
    } catch (error) {
      setTranscriptError(error instanceof Error ? error.message : 'Failed to create transcript session.');
    } finally {
      setIsCreatingTranscriptSession(false);
    }
  };

  const updateTranscriptSessionModel = async (sessionId: string, modelId: string): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;

    if (!sessionId || !appApi || typeof appApi.updateTranscriptSessionModel !== 'function' || typeof appApi.getTranscriptSessions !== 'function') {
      return;
    }

    setTranscriptError(null);

    try {
      const sessionDetail = await appApi.updateTranscriptSessionModel(sessionId, modelId);
      const transcriptView = await appApi.getTranscriptSessions();
      setActiveTranscriptSession(sessionDetail);
      setTranscriptSessions(transcriptView.sessions);
    } catch (error) {
      setTranscriptError(error instanceof Error ? error.message : 'Failed to update transcript session model.');
    }
  };

  const loadTranscriptSessionModel = async (sessionId: string): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;
    const session = transcriptSessions.find((entry) => entry.id === sessionId);

    if (!session || !appApi || typeof appApi.loadTranscriptSessionModel !== 'function') {
      return;
    }

    setTranscriptModelActionByModelId((currentValue) => ({
      ...currentValue,
      [session.modelId]: 'loading'
    }));
    setTranscriptError(null);

    try {
      const transcriptView = await appApi.loadTranscriptSessionModel(sessionId);
      setTranscriptSessions(transcriptView.sessions);
      await refreshModelState();
    } catch (error) {
      setTranscriptError(error instanceof Error ? error.message : 'Failed to load session model.');
    } finally {
      setTranscriptModelActionByModelId((currentValue) => {
        const nextValue = { ...currentValue };
        delete nextValue[session.modelId];
        return nextValue;
      });
    }
  };

  const unloadTranscriptSessionModel = async (sessionId: string): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;
    const session = transcriptSessions.find((entry) => entry.id === sessionId);

    if (!session || !appApi || typeof appApi.unloadTranscriptSessionModel !== 'function') {
      return;
    }

    setTranscriptModelActionByModelId((currentValue) => ({
      ...currentValue,
      [session.modelId]: 'unloading'
    }));
    setTranscriptError(null);

    try {
      const transcriptView = await appApi.unloadTranscriptSessionModel(sessionId);
      setTranscriptSessions(transcriptView.sessions);
      await refreshModelState();
    } catch (error) {
      setTranscriptError(error instanceof Error ? error.message : 'Failed to unload session model.');
    } finally {
      setTranscriptModelActionByModelId((currentValue) => {
        const nextValue = { ...currentValue };
        delete nextValue[session.modelId];
        return nextValue;
      });
    }
  };

  const deleteTranscriptSession = async (sessionId: string): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;

    if (!appApi || typeof appApi.deleteTranscriptSession !== 'function' || typeof appApi.getTranscriptSession !== 'function') {
      return;
    }

    setDeletingTranscriptSessionId(sessionId);
    setTranscriptError(null);

    try {
      const transcriptView = await appApi.deleteTranscriptSession(sessionId);
      setTranscriptSessions(transcriptView.sessions);

      if (activeTranscriptSession?.session.id === sessionId) {
        if (transcriptView.activeSessionId) {
          const nextSessionDetail = await appApi.getTranscriptSession(transcriptView.activeSessionId);
          setActiveTranscriptSession(nextSessionDetail);
        } else {
          setActiveTranscriptSession(null);
        }
      }
    } catch (error) {
      setTranscriptError(error instanceof Error ? error.message : 'Failed to delete transcript session.');
    } finally {
      setDeletingTranscriptSessionId(null);
    }
  };

  const startTranscript = async (): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;

    if (!activeTranscriptSession || !appApi || typeof appApi.startTranscriptSession !== 'function') {
      return;
    }

    setIsStartingTranscript(true);
    setTranscriptError(null);
    setTranscriptPreviewText('');

    try {
      const sessionDetail = await appApi.startTranscriptSession(activeTranscriptSession.session.id);
      setActiveTranscriptSession(sessionDetail);
      await refreshTranscriptSessions();
    } catch (error) {
      setTranscriptError(error instanceof Error ? error.message : 'Failed to start live transcription.');
    } finally {
      setIsStartingTranscript(false);
    }
  };

  const stopTranscript = async (): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;

    if (!activeTranscriptSession || !appApi || typeof appApi.stopTranscriptSession !== 'function') {
      return;
    }

    setIsStoppingTranscript(true);
    setTranscriptError(null);

    try {
      const sessionDetail = await appApi.stopTranscriptSession(activeTranscriptSession.session.id);
      setActiveTranscriptSession(sessionDetail);
      setTranscriptPreviewText('');
      await refreshTranscriptSessions();
    } catch (error) {
      setTranscriptError(error instanceof Error ? error.message : 'Failed to stop live transcription.');
    } finally {
      setIsStoppingTranscript(false);
    }
  };

  const downloadedModels = useMemo(() => catalogModels.filter((model) => model.downloaded), [catalogModels]);
  const chatEligibleModels = useMemo(() => downloadedModels.filter((model) => model.supportsTextChat), [downloadedModels]);
  const transcriptEligibleModels = useMemo(() => downloadedModels.filter((model) => model.supportsLiveTranscription), [downloadedModels]);

  return (
    <AppShell
      activeChatSession={activeChatSession}
      activeTranscriptSession={activeTranscriptSession}
      audioSettings={audioSettings}
      busyModelId={busyModelId}
      catalogModels={catalogModels}
      chatDraftMessage={chatDraftMessage}
      chatEligibleModels={chatEligibleModels}
      chatError={chatError}
      chatModelActionByModelId={chatModelActionByModelId}
      chatSessions={chatSessions}
      deletingChatSessionId={deletingChatSessionId}
      deletingTranscriptSessionId={deletingTranscriptSessionId}
      downloadProgressByModelId={downloadProgressByModelId}
      epProgressByName={epProgressByName}
      isCatalogLoading={isCatalogLoading}
      isCatalogOpen={isCatalogOpen}
      isChatSessionLoading={isChatSessionLoading}
      isCreatingChatSession={isCreatingChatSession}
      isCreatingTranscriptSession={isCreatingTranscriptSession}
      isRefreshingCatalog={isRefreshingCatalog}
      isRegisteringEps={isRegisteringEps}
      isRuntimeRefreshing={isRuntimeRefreshing}
      isSavingAudioSettings={isSavingAudioSettings}
      isSendingChatMessage={isSendingChatMessage}
      isStartingTranscript={isStartingTranscript}
      isStoppingTranscript={isStoppingTranscript}
      isTranscriptSessionLoading={isTranscriptSessionLoading}
      isWebServiceToggling={isWebServiceToggling}
      onCloseCatalog={() => {
        setIsCatalogOpen(false);
      }}
      onCreateChatSession={createChatSession}
      onCreateTranscriptSession={createTranscriptSession}
      onDeleteChatSession={deleteChatSession}
      onDeleteTranscriptSession={deleteTranscriptSession}
      onLoadChatSessionModel={loadChatSessionModel}
      onLoadTranscriptSessionModel={loadTranscriptSessionModel}
      onMutateCatalogModel={mutateCatalogModel}
      onOpenCatalog={() => {
        setIsCatalogOpen(true);
      }}
      onOpenChatSession={openChatSession}
      onOpenTranscriptSession={openTranscriptSession}
      onRefreshCatalog={refreshCatalog}
      onRefreshRuntime={refreshRuntime}
      onRegisterExecutionProviders={registerExecutionProviders}
      onSaveAudioSettings={saveAudioSettings}
      onSendChatMessage={sendChatMessage}
      onSetChatDraftMessage={setChatDraftMessage}
      onStartTranscript={startTranscript}
      onStopTranscript={stopTranscript}
      onToggleWebService={toggleWebService}
      onUnloadChatSessionModel={unloadChatSessionModel}
      onUnloadTranscriptSessionModel={unloadTranscriptSessionModel}
      onUpdateChatSessionModel={updateChatSessionModel}
      onUpdateTranscriptSessionModel={updateTranscriptSessionModel}
      runtime={runtime}
      sidebarCollapsed={sidebarCollapsed}
      state={state}
      toggleSidebar={() => {
        setSidebarCollapsed((currentValue) => !currentValue);
      }}
      transcriptEligibleModels={transcriptEligibleModels}
      transcriptError={transcriptError}
      transcriptModelActionByModelId={transcriptModelActionByModelId}
      transcriptPreviewText={transcriptPreviewText}
      transcriptSessions={transcriptSessions}
    />
  );
}
