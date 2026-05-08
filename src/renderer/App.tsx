import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { Cpu, Download, LibraryBig, LoaderCircle, MessageSquare, Moon, Play, Plus, RefreshCw, Search, SendHorizontal, Settings, Square, Sun, Trash2, XCircle } from 'lucide-react';
import { useTheme, type ThemePreference } from '@/components/theme-provider';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Sidebar, SidebarContent, SidebarHeader, SidebarNav } from '@/components/ui/sidebar';
import { StatusBar, StatusBarContent } from '@/components/ui/status-bar';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type {
  FoundryAppState,
  FoundryCatalogAction,
  FoundryChatMessageView,
  FoundryChatStreamEvent,
  FoundryChatSessionDetailView,
  FoundryChatSessionView,
  FoundryCatalogModelView,
  FoundryDownloadProgressEvent,
  FoundryEpDownloadProgressEvent,
  FoundryRuntimeView
} from '../shared/foundry-state.js';

const pages = [
  { to: '/', label: 'Catalog', icon: LibraryBig, description: 'Browse available Foundry Local models.' },
  { to: '/chat', label: 'Chat', icon: MessageSquare, description: 'Chat with downloaded models.' },
  { to: '/runtime', label: 'Runtime', icon: Cpu, description: 'Inspect local runtime and web service state.' },
  { to: '/settings', label: 'Settings', icon: Settings, description: 'Application and SDK settings.' }
] as const;

const panelSurfaceClassName = 'bg-card/85 backdrop-blur supports-[backdrop-filter]:bg-card/75';

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

function PlaceholderPage(props: { title: string; description: string }) {
  return (
    <Card className={panelSurfaceClassName}>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        <CardDescription className="max-w-2xl text-pretty break-words">{props.description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function CatalogPage(props: {
  busyModelId: string | null;
  downloadProgressByModelId: Record<string, number>;
  isRefreshing: boolean;
  isLoading: boolean;
  models: FoundryCatalogModelView[];
  onMutateModel: (modelId: string, action: FoundryCatalogAction) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [searchValue, setSearchValue] = useState('');
  const [downloadedOnly, setDownloadedOnly] = useState(false);

  const visibleModels = useMemo(() => {
    const normalizedSearchValue = searchValue.trim().toLowerCase();

    return props.models.filter((model) => {
      if (downloadedOnly && !model.downloaded) {
        return false;
      }

      if (!normalizedSearchValue) {
        return true;
      }

      return [model.alias, model.name, model.task, model.modelType].some((value) => value.toLowerCase().includes(normalizedSearchValue));
    });
  }, [downloadedOnly, props.models, searchValue]);

  const downloadedCount = props.models.filter((model) => model.downloaded).length;
  const downloadedOnlyStatusText = downloadedOnly ? `${visibleModels.length} downloaded model${visibleModels.length === 1 ? '' : 's'} shown` : null;

  return (
    <div className="space-y-4">
      <Card className={panelSurfaceClassName}>
        <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <CardTitle>Catalog</CardTitle>
            <CardDescription className="mt-2 max-w-3xl text-pretty break-words">
              Browse the full model catalog, filter to downloaded models only, and download or remove models directly from each card.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Total: {props.models.length}</Badge>
            <Badge variant="outline">Downloaded: {downloadedCount}</Badge>
            <Badge variant="outline">Showing: {visibleModels.length}</Badge>
            {downloadedOnlyStatusText ? <Badge variant="outline">{downloadedOnlyStatusText}</Badge> : null}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(event) => {
                setSearchValue(event.target.value);
              }}
              placeholder="Search by model name, alias, type, or task"
              className="pl-9"
            />
          </div>
          <label className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/50 px-3 py-2 text-sm">
            <Switch checked={downloadedOnly} onCheckedChange={setDownloadedOnly} />
            <span>Downloaded only</span>
          </label>
          <Button type="button" variant="ghost" onClick={props.onRefresh} disabled={props.isRefreshing}>
            <RefreshCw className={cn('size-4', props.isRefreshing ? 'animate-spin' : '')} />
            Refresh
          </Button>
        </CardContent>
      </Card>

      {props.isLoading ? (
        <Card className={panelSurfaceClassName}>
          <CardHeader>
            <CardTitle className="text-xl">Loading catalog</CardTitle>
            <CardDescription className="flex items-center gap-2">
              <LoaderCircle className="size-4 animate-spin" />
              Reading available models from Foundry Local.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {!props.isLoading && visibleModels.length > 0 ? (
      <div className="grid gap-4 xl:grid-cols-2">
        {visibleModels.map((model) => {
          const isBusy = props.busyModelId === model.id;
          const downloadProgress = props.downloadProgressByModelId[model.id];
          const primaryActionLabel = model.downloaded ? 'Remove' : 'Download';

          return (
            <Card key={model.id} className={panelSurfaceClassName}>
              <CardHeader className="gap-3">
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-xl" title={model.name}>{model.name}</CardTitle>
                    <CardDescription className="mt-1 truncate" title={`${model.alias} · v${model.version}`}>
                      {model.alias} · v{model.version}
                    </CardDescription>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2 self-start">
                    <Badge variant="outline">{model.modelType}</Badge>
                    <Badge variant="outline">{model.task}</Badge>
                    {model.downloaded ? <Badge variant="success">Downloaded</Badge> : <Badge variant="default">Available</Badge>}
                    {model.loaded ? <Badge variant="success">Loaded</Badge> : null}
                    {typeof downloadProgress === 'number' ? <Badge variant="outline">{Math.round(downloadProgress)}%</Badge> : null}
                    {model.supportsToolCalling ? <Badge variant="outline">Tools</Badge> : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Size</p>
                    <p className="mt-2 text-sm text-foreground/90">{model.size}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Context length</p>
                    <p className="mt-2 text-sm text-foreground/90">{model.contextLength}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Input</p>
                    <p className="mt-2 break-words text-sm text-foreground/90">{model.inputModalities.join(', ')}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-background/40 p-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Output</p>
                    <p className="mt-2 break-words text-sm text-foreground/90">{model.outputModalities.join(', ')}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={model.downloaded ? 'secondary' : 'default'}
                    disabled={isBusy}
                    onClick={() => {
                      void props.onMutateModel(model.id, model.downloaded ? 'remove' : 'download');
                    }}
                  >
                    {isBusy ? <LoaderCircle className="size-4 animate-spin" /> : model.downloaded ? <Trash2 className="size-4" /> : <Download className="size-4" />}
                    {typeof downloadProgress === 'number' && !model.downloaded ? `Downloading ${Math.round(downloadProgress)}%` : primaryActionLabel}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    disabled={!model.downloaded || isBusy}
                    onClick={() => {
                      void props.onMutateModel(model.id, model.loaded ? 'unload' : 'load');
                    }}
                  >
                    {isBusy ? <LoaderCircle className="size-4 animate-spin" /> : null}
                    {model.loaded ? 'Unload' : 'Load'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      ) : null}

      {!props.isLoading && visibleModels.length === 0 ? (
        <Card className={panelSurfaceClassName}>
          <CardHeader>
            <CardTitle className="text-xl">No models match the current filter</CardTitle>
            <CardDescription>
              Try clearing the search or disable the downloaded-only filter to see the rest of the catalog.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  );
}

function SettingsPage() {
  const { resolvedTheme, setThemePreference, themePreference } = useTheme();

  const options: Array<{ value: ThemePreference; label: string; description: string; icon: typeof Sun }> = [
    {
      value: 'system',
      label: 'System',
      description: `Follow the OS setting. Currently using ${resolvedTheme}.`,
      icon: Cpu
    },
    {
      value: 'light',
      label: 'Light',
      description: 'Use the light theme regardless of system preference.',
      icon: Sun
    },
    {
      value: 'dark',
      label: 'Dark',
      description: 'Use the dark theme regardless of system preference.',
      icon: Moon
    }
  ];

  return (
    <Card className={panelSurfaceClassName}>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription className="max-w-2xl text-pretty break-words">
          Theme defaults to the system appearance until you choose an explicit override.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="grid gap-3 md:grid-cols-3">
          {options.map((option) => {
            const Icon = option.icon;
            const isActive = option.value === themePreference;

            return (
              <Button
                key={option.value}
                type="button"
                variant={isActive ? 'secondary' : 'ghost'}
                className={cn(
                  'h-auto min-w-0 items-start justify-start rounded-xl border border-border/70 px-4 py-4 text-left whitespace-normal',
                  isActive ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : 'bg-card/50'
                )}
                onClick={() => {
                  setThemePreference(option.value);
                }}
              >
                <div className="flex w-full min-w-0 items-start gap-3">
                  <div className="mt-0.5 rounded-lg bg-background/70 p-2">
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 break-words text-sm font-medium text-foreground">{option.label}</span>
                    </div>
                    <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{option.description}</p>
                  </div>
                </div>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function RuntimePage(props: {
  epProgressByName: Record<string, number>;
  isRegisteringEps: boolean;
  isRefreshing: boolean;
  isTogglingWebService: boolean;
  onRefresh: () => Promise<void>;
  onRegisterEp: (epName?: string) => Promise<void>;
  onToggleWebService: () => Promise<void>;
  runtime: FoundryRuntimeView;
}) {
  const unregisteredProviders = props.runtime.executionProviders.filter((provider) => !provider.isRegistered);

  return (
    <div className="space-y-4">
      <Card className={panelSurfaceClassName}>
        <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <CardTitle>Runtime</CardTitle>
            <CardDescription className="mt-2 max-w-3xl text-pretty break-words">
              Inspect the embedded web service and install execution providers for local acceleration.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Web service: {props.runtime.webServiceRunning ? 'Running' : 'Stopped'}</Badge>
            <Badge variant="outline">EPs: {props.runtime.executionProviders.length}</Badge>
            <Badge variant="outline">Registered: {props.runtime.executionProviders.filter((provider) => provider.isRegistered).length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" variant={props.runtime.webServiceRunning ? 'secondary' : 'default'} disabled={props.isTogglingWebService} onClick={() => {
            void props.onToggleWebService();
          }}>
            {props.isTogglingWebService ? <LoaderCircle className="size-4 animate-spin" /> : props.runtime.webServiceRunning ? <Square className="size-4" /> : <Play className="size-4" />}
            {props.runtime.webServiceRunning ? 'Stop web service' : 'Start web service'}
          </Button>
          <Button type="button" variant="ghost" disabled={props.isRefreshing} onClick={() => {
            void props.onRefresh();
          }}>
            <RefreshCw className={cn('size-4', props.isRefreshing ? 'animate-spin' : '')} />
            Refresh runtime
          </Button>
          <Button type="button" variant="ghost" disabled={props.isRegisteringEps || unregisteredProviders.length === 0} onClick={() => {
            void props.onRegisterEp();
          }}>
            {props.isRegisteringEps ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
            Register available EPs
          </Button>
        </CardContent>
      </Card>

      <Card className={panelSurfaceClassName}>
        <CardHeader>
          <CardTitle>Web Service</CardTitle>
          <CardDescription>
            The embedded local web service is required for HTTP-backed SDK flows like `ResponsesClient`.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={props.runtime.webServiceRunning ? 'success' : 'default'}>
              {props.runtime.webServiceRunning ? 'Running' : 'Stopped'}
            </Badge>
          </div>
          {props.runtime.webServiceUrls.length > 0 ? (
            <div className="grid gap-3">
              {props.runtime.webServiceUrls.map((url) => (
                <div key={url} className="rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-sm text-foreground/90">
                  {url}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No bound URLs yet. Start the web service to allocate a local endpoint.</p>
          )}
        </CardContent>
      </Card>

      <Card className={panelSurfaceClassName}>
        <CardHeader>
          <CardTitle>Execution Providers</CardTitle>
          <CardDescription>
            Discover hardware-specific execution providers and register them when local acceleration is available.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {props.runtime.executionProviders.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {props.runtime.executionProviders.map((provider) => {
                const progress = props.epProgressByName[provider.name];

                return (
                  <div key={provider.name} className="rounded-xl border border-border/70 bg-background/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground" title={provider.name}>{provider.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {provider.isRegistered ? 'Registered and ready for runtime selection.' : 'Detected on this machine but not registered yet.'}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-2">
                        <Badge variant={provider.isRegistered ? 'success' : 'outline'}>
                          {provider.isRegistered ? 'Registered' : 'Available'}
                        </Badge>
                        {typeof progress === 'number' ? <Badge variant="outline">{Math.round(progress)}%</Badge> : null}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button type="button" variant={provider.isRegistered ? 'secondary' : 'default'} disabled={provider.isRegistered || props.isRegisteringEps} onClick={() => {
                        void props.onRegisterEp(provider.name);
                      }}>
                        {props.isRegisteringEps && typeof progress === 'number' ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                        {typeof progress === 'number' && !provider.isRegistered ? `Registering ${Math.round(progress)}%` : provider.isRegistered ? 'Registered' : 'Register EP'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No execution providers were discovered for the current environment.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function ChatPage(props: {
  activeSession: FoundryChatSessionDetailView | null;
  availableModels: FoundryCatalogModelView[];
  chatError: string | null;
  deletingSessionId: string | null;
  draftMessage: string;
  isCreatingSession: boolean;
  isLoadingSession: boolean;
  isSendingMessage: boolean;
  onCreateSession: (modelId: string) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onDraftMessageChange: (value: string) => void;
  onLoadSessionModel: (sessionId: string) => Promise<void>;
  onOpenSession: (sessionId: string) => Promise<void>;
  onSendMessage: () => Promise<void>;
  onUnloadSessionModel: (sessionId: string) => Promise<void>;
  modelActionByModelId: Record<string, 'loading' | 'unloading'>;
  sessions: FoundryChatSessionView[];
}) {
  const [selectedModelId, setSelectedModelId] = useState('');
  const messageListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (props.availableModels.some((model) => model.id === selectedModelId)) {
      return;
    }

    setSelectedModelId(props.availableModels[0]?.id ?? '');
  }, [props.availableModels, selectedModelId]);

  useEffect(() => {
    const container = messageListRef.current;

    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [props.activeSession, props.isSendingMessage]);

  const activeModelStillAvailable = props.activeSession
    ? props.availableModels.some((model) => model.id === props.activeSession?.session.modelId)
    : true;
  const activeSessionSummary = props.activeSession
    ? props.sessions.find((session) => session.id === props.activeSession?.session.id) ?? null
    : null;
  const activeSessionModelAction = activeSessionSummary ? props.modelActionByModelId[activeSessionSummary.modelId] : undefined;
  const activeSessionModelLoaded = activeSessionSummary?.modelLoaded ?? false;

  return (
    <div className="grid min-h-[calc(100vh-10rem)] gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card className={panelSurfaceClassName}>
          <CardHeader>
            <CardTitle>New session</CardTitle>
            <CardDescription>
              Create a chat history first, then explicitly load its model when you want to use it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <label className="block text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Downloaded text model</label>
              <select
                value={selectedModelId}
                onChange={(event) => {
                  setSelectedModelId(event.target.value);
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                disabled={props.availableModels.length === 0 || props.isCreatingSession}
              >
                {props.availableModels.length === 0 ? <option value="">No downloaded text models available</option> : null}
                {props.availableModels.map((model) => (
                  <option key={model.id} value={model.id}>{model.name} ({model.alias})</option>
                ))}
              </select>
            </div>
            <Button type="button" className="w-full" disabled={!selectedModelId || props.isCreatingSession} onClick={() => {
              void props.onCreateSession(selectedModelId);
            }}>
              {props.isCreatingSession ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {props.isCreatingSession ? 'Creating session' : 'Create session'}
            </Button>
          </CardContent>
        </Card>

        <Card className={cn(panelSurfaceClassName, 'min-h-0 xl:max-h-[calc(100vh-13rem)] xl:flex xl:flex-col')}>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>
            Keep multiple conversation histories and load only the model you want to use right now.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 space-y-3 xl:flex-1 xl:overflow-auto">
          {props.sessions.length > 0 ? props.sessions.map((session) => {
            const isActive = props.activeSession?.session.id === session.id;
            const sessionAction = props.modelActionByModelId[session.modelId];
            const sessionStatusLabel = sessionAction === 'loading'
              ? 'Loading'
              : sessionAction === 'unloading'
                ? 'Unloading'
                : session.modelLoaded
                  ? 'Loaded'
                  : 'Not loaded';
            const sessionStatusVariant = sessionAction === 'loading' || sessionAction === 'unloading'
              ? 'outline'
              : session.modelLoaded
                ? 'success'
                : 'default';

            return (
              <div
                key={session.id}
                className={cn(
                  'rounded-2xl border border-border/70 p-3 transition-colors',
                  isActive ? 'bg-secondary/70' : 'bg-background/40'
                )}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => {
                    void props.onOpenSession(session.id);
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" title={session.title}>{session.title}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground" title={session.modelName}>{session.modelName}</p>
                    </div>
                    <Badge variant={sessionStatusVariant}>{sessionStatusLabel}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{session.messageCount} messages</span>
                    <span>Updated {formatTimestamp(session.updatedAt)}</span>
                  </div>
                </button>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
                  <Button
                    type="button"
                    variant={session.modelLoaded ? 'secondary' : 'default'}
                    className="h-8 px-3 text-xs"
                    disabled={sessionAction === 'loading' || sessionAction === 'unloading' || props.deletingSessionId === session.id}
                    onClick={() => {
                      void (session.modelLoaded ? props.onUnloadSessionModel(session.id) : props.onLoadSessionModel(session.id));
                    }}
                  >
                    {sessionAction === 'loading' || sessionAction === 'unloading' ? <LoaderCircle className="size-3.5 animate-spin" /> : session.modelLoaded ? <XCircle className="size-3.5" /> : <Play className="size-3.5" />}
                    {sessionAction === 'loading' ? 'Loading model' : sessionAction === 'unloading' ? 'Unloading model' : session.modelLoaded ? 'Unload model' : 'Load model'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 px-3 text-xs text-muted-foreground"
                    disabled={props.deletingSessionId === session.id || sessionAction === 'loading' || sessionAction === 'unloading'}
                    onClick={() => {
                      void props.onDeleteSession(session.id);
                    }}
                  >
                    {props.deletingSessionId === session.id ? <LoaderCircle className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                    {props.deletingSessionId === session.id ? 'Deleting' : 'Delete'}
                  </Button>
                </div>
              </div>
            );
          }) : (
            <div className="rounded-2xl border border-dashed border-border/70 bg-background/20 px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">No sessions yet. Create one from a downloaded text model to get started.</p>
            </div>
          )}
        </CardContent>
      </Card>
      </div>

      <Card className={cn(panelSurfaceClassName, 'flex min-h-0 flex-col')}>
        <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <CardTitle>{props.activeSession ? props.activeSession.session.title : 'Chat'}</CardTitle>
            <CardDescription className="mt-2 max-w-3xl text-pretty break-words">
              {props.activeSession
                ? `Talking to ${props.activeSession.session.modelName}. Sessions are persisted locally in the app.`
                : 'Select or create a session to start chatting with a downloaded model.'}
            </CardDescription>
          </div>
          {props.activeSession ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{props.activeSession.session.modelAlias}</Badge>
              {activeModelStillAvailable ? <Badge variant="success">Model available</Badge> : <Badge variant="destructive">Model missing</Badge>}
              {activeModelStillAvailable ? <Badge variant={activeSessionModelAction ? 'outline' : activeSessionModelLoaded ? 'success' : 'default'}>{activeSessionModelAction === 'loading' ? 'Loading model' : activeSessionModelAction === 'unloading' ? 'Unloading model' : activeSessionModelLoaded ? 'Model loaded' : 'Model not loaded'}</Badge> : null}
            </div>
          ) : null}
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
          {props.chatError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {props.chatError}
            </div>
          ) : null}

          <div ref={messageListRef} className="min-h-0 flex-1 space-y-3 overflow-auto rounded-xl border border-border/70 bg-background/30 p-3">
            {props.activeSession ? props.activeSession.messages.length > 0 ? props.activeSession.messages.map((message: FoundryChatMessageView) => (
              <div key={message.id} className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[min(100%,42rem)] rounded-2xl px-4 py-3 text-sm shadow-sm',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : message.failed
                      ? 'border border-destructive/30 bg-destructive/10 text-destructive'
                      : 'border border-border/70 bg-card text-card-foreground'
                )}>
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  <p className={cn('mt-2 text-[11px]', message.role === 'user' ? 'text-primary-foreground/80' : message.failed ? 'text-destructive/80' : 'text-muted-foreground')}>
                    {formatTimestamp(message.createdAt)}
                  </p>
                </div>
              </div>
            )) : (
              <div className="flex h-full items-center justify-center">
                <p className="max-w-md text-center text-sm text-muted-foreground">Send the first message to start this session.</p>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="max-w-md text-center text-sm text-muted-foreground">Create a session from the left panel to begin chatting.</p>
              </div>
            )}
            {props.isLoadingSession ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <LoaderCircle className="mr-2 size-4 animate-spin" />
                Loading session
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background/40 p-3">
            <textarea
              value={props.draftMessage}
              onChange={(event) => {
                props.onDraftMessageChange(event.target.value);
              }}
              placeholder={props.activeSession ? 'Message the current session' : 'Create a session first'}
              className="min-h-28 w-full resize-none rounded-lg border border-input bg-background px-3 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!props.activeSession || !activeModelStillAvailable || !activeSessionModelLoaded || Boolean(activeSessionModelAction) || props.isSendingMessage}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {props.activeSession
                  ? activeModelStillAvailable
                    ? activeSessionModelAction === 'loading'
                      ? 'Model is loading for this session.'
                      : activeSessionModelAction === 'unloading'
                        ? 'Model is unloading for this session.'
                        : activeSessionModelLoaded
                          ? 'Plain-text responses first. Session history is stored locally by the app.'
                          : 'Load this session model from the left panel before sending messages.'
                    : 'This session model is no longer downloaded. Re-download it from Catalog to continue.'
                  : 'Select a downloaded model and create a session to start.'}
              </p>
              <Button type="button" disabled={!props.activeSession || !activeModelStillAvailable || !activeSessionModelLoaded || Boolean(activeSessionModelAction) || !props.draftMessage.trim() || props.isSendingMessage} onClick={() => {
                void props.onSendMessage();
              }}>
                {props.isSendingMessage ? <LoaderCircle className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
                Send
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
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

  const createChatSession = async (modelId: string): Promise<void> => {
    const appApi = globalThis.window?.foundryLocalApp;

    if (!appApi || typeof appApi.createChatSession !== 'function' || typeof appApi.getChatSessions !== 'function') {
      return;
    }

    setIsCreatingChatSession(true);
    setChatError(null);

    try {
      const sessionDetail = await appApi.createChatSession(modelId);
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
    } finally {
      setDeletingChatSessionId(null);
    }
  };

  const downloadedModels = useMemo(() => catalogModels.filter((model) => model.downloaded), [catalogModels]);
  const chatEligibleModels = useMemo(() => downloadedModels.filter((model) => model.supportsTextChat), [downloadedModels]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.15),_transparent_45%),linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)/0.45))] text-foreground transition-colors">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => {
          setSidebarCollapsed((currentValue) => !currentValue);
        }}>
          <SidebarHeader className={cn('min-w-0', sidebarCollapsed ? 'px-3' : '')}>
            {sidebarCollapsed ? (
              <div className="flex justify-center">
                <div
                  className="flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background/60 text-primary"
                  aria-label="Foundry"
                  title="Foundry"
                >
                  <span className="text-sm font-semibold tracking-[0.08em]">F</span>
                </div>
              </div>
            ) : (
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-primary">Foundry Local</p>
            )}
          </SidebarHeader>

          <SidebarContent>
            <SidebarNav>
              {pages.map((page) => {
                const Icon = page.icon;

                return (
                  <NavLink
                    key={page.to}
                    to={page.to}
                    end={page.to === '/'}
                    className={({ isActive }) =>
                      cn(
                        buttonVariants({ variant: isActive ? 'secondary' : 'ghost' }),
                        'h-auto w-full min-w-0 justify-start gap-3 px-3 py-3 text-left whitespace-normal',
                        sidebarCollapsed ? 'justify-center px-0' : ''
                      )
                    }
                    title={sidebarCollapsed ? page.label : undefined}
                  >
                    <Icon className="size-4 shrink-0" />
                    {!sidebarCollapsed ? (
                      <span className="min-w-0">
                        <span className="block break-words text-sm font-medium">{page.label}</span>
                        <span className="block break-words text-xs text-muted-foreground">{page.description}</span>
                      </span>
                    ) : null}
                  </NavLink>
                );
              })}
            </SidebarNav>
          </SidebarContent>
        </Sidebar>

        <main className="min-w-0 flex-1 overflow-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="mx-auto max-w-7xl space-y-4">
            {state.lastError ? (
              <Card className={panelSurfaceClassName}>
                <CardHeader>
                  <div className="flex min-w-0 gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    <div className="min-w-0">
                      <p className="font-medium">SDK bootstrap failed</p>
                      <p className="mt-1 break-words text-destructive/90">{state.lastError.message}</p>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ) : null}
            <Routes>
              <Route path="/" element={<CatalogPage busyModelId={busyModelId} downloadProgressByModelId={downloadProgressByModelId} isLoading={isCatalogLoading} isRefreshing={isRefreshingCatalog} models={catalogModels} onMutateModel={mutateCatalogModel} onRefresh={refreshCatalog} />} />
              <Route path="/chat" element={<ChatPage activeSession={activeChatSession} availableModels={chatEligibleModels} chatError={chatError} deletingSessionId={deletingChatSessionId} draftMessage={chatDraftMessage} isCreatingSession={isCreatingChatSession} isLoadingSession={isChatSessionLoading} isSendingMessage={isSendingChatMessage} onCreateSession={createChatSession} onDeleteSession={deleteChatSession} onDraftMessageChange={setChatDraftMessage} onLoadSessionModel={loadChatSessionModel} onOpenSession={openChatSession} onSendMessage={sendChatMessage} onUnloadSessionModel={unloadChatSessionModel} modelActionByModelId={chatModelActionByModelId} sessions={chatSessions} />} />
              <Route path="/runtime" element={<RuntimePage epProgressByName={epProgressByName} isRegisteringEps={isRegisteringEps} isRefreshing={isRuntimeRefreshing} isTogglingWebService={isWebServiceToggling} onRefresh={refreshRuntime} onRegisterEp={registerExecutionProviders} onToggleWebService={toggleWebService} runtime={runtime} />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </div>
        </main>
      </div>

      <StatusBar>
        <StatusBarContent>
          <StatusPill label="Bootstrap" value={state.bootstrapStage} tone={state.bootstrapStage} />
          <StatusPill label="SDK" value={state.sdkStage} tone={state.sdkStage} />
          <StatusPill label="Web service" value={state.webServiceStage} tone={state.webServiceStage} />
          <StatusPill label="Loaded models" value={String(state.loadedModelCount)} tone={state.loadedModelCount > 0 ? 'ready' : 'stopped'} />
        </StatusBarContent>
      </StatusBar>
    </div>
  );
}
