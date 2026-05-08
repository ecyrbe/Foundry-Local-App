import { useEffect, useMemo, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { Check, Cpu, Download, LibraryBig, LoaderCircle, MessageSquare, Monitor, Moon, RefreshCw, Search, Settings, Sun, Trash2 } from 'lucide-react';
import { useTheme, type ThemePreference } from '@/components/theme-provider';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Sidebar, SidebarContent, SidebarHeader, SidebarNav } from '@/components/ui/sidebar';
import { StatusBar, StatusBarContent } from '@/components/ui/status-bar';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { FoundryAppState, FoundryCatalogAction, FoundryCatalogModelView, FoundryDownloadProgressEvent } from '../shared/foundry-state.js';

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

function ThemeSettingCard() {
  const { resolvedTheme, setThemePreference, themePreference } = useTheme();

  const options: Array<{ value: ThemePreference; label: string; description: string; icon: typeof Monitor }> = [
    {
      value: 'system',
      label: 'System',
      description: `Follow the OS setting. Currently using ${resolvedTheme}.`,
      icon: Monitor
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
                      {isActive ? <Check className="size-4 text-primary" /> : null}
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

export function App() {
  const [state, setState] = useState<FoundryAppState>(loadingState);
  const [catalogModels, setCatalogModels] = useState<FoundryCatalogModelView[]>([]);
  const [busyModelId, setBusyModelId] = useState<string | null>(null);
  const [downloadProgressByModelId, setDownloadProgressByModelId] = useState<Record<string, number>>({});
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [isRefreshingCatalog, setIsRefreshingCatalog] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const loadedModelCount = catalogModels.filter((model) => model.loaded).length;

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
              <Route path="/chat" element={<PlaceholderPage title="Chat" description="This page will use the Responses API first and only allow selecting locally downloaded models." />} />
              <Route path="/runtime" element={<PlaceholderPage title="Runtime" description="This page will expose web service controls and execution provider management." />} />
              <Route path="/settings" element={<ThemeSettingCard />} />
            </Routes>
          </div>
        </main>
      </div>

      <StatusBar>
        <StatusBarContent>
          <StatusPill label="Bootstrap" value={state.bootstrapStage} tone={state.bootstrapStage} />
          <StatusPill label="SDK" value={state.sdkStage} tone={state.sdkStage} />
          <StatusPill label="Web service" value={state.webServiceStage} tone={state.webServiceStage} />
          <StatusPill label="Loaded models" value={String(loadedModelCount)} tone={loadedModelCount > 0 ? 'ready' : 'stopped'} />
        </StatusBarContent>
      </StatusBar>
    </div>
  );
}
