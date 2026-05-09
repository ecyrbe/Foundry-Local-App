import { useMemo, useState } from 'react';
import { Download, LoaderCircle, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { FoundryCatalogAction, FoundryCatalogModelView } from '../../shared/foundry-state.js';
import { panelSurfaceClassName } from './shared';

function CatalogPage(props: {
  busyModelId: string | null;
  downloadProgressByModelId: Record<string, number>;
  isRefreshing: boolean;
  isLoading: boolean;
  models: FoundryCatalogModelView[];
  onClose: () => void;
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

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 py-4 sm:px-6 sm:py-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Catalog</h1>
          <p className="text-sm text-muted-foreground">Browse, download, load, and remove local models.</p>
        </div>
        <Button type="button" variant="ghost" onClick={props.onClose}>
          <X className="size-4" />
          Close
        </Button>
      </div>

      <Card className={panelSurfaceClassName}>
        <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <CardTitle>Model Catalog</CardTitle>
            <CardDescription className="mt-2 max-w-3xl text-pretty break-words">
              Filter the local catalog and manage downloaded models directly from each card.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Total: {props.models.length}</Badge>
            <Badge variant="outline">Downloaded: {downloadedCount}</Badge>
            <Badge variant="outline">Showing: {visibleModels.length}</Badge>
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

      <div className="min-h-0 flex-1 overflow-auto pr-1">
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
                        {typeof downloadProgress === 'number' && !model.downloaded ? `Downloading ${Math.round(downloadProgress)}%` : model.downloaded ? 'Remove' : 'Download'}
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
    </div>
  );
}

export { CatalogPage };
