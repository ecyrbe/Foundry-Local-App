import { Cpu, Download, LoaderCircle, Moon, Play, RefreshCw, Square, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from '@/components/theme-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { FoundryAudioSettingsInput, FoundryAudioSettingsView, FoundryRuntimeView } from '../../shared/foundry-state.js';
import { CatalogButton, panelSurfaceClassName } from './shared';

function SettingsRuntimePage(props: {
  audioSettings: FoundryAudioSettingsView;
  epProgressByName: Record<string, number>;
  isCatalogOpen: boolean;
  isSavingAudioSettings: boolean;
  isRegisteringEps: boolean;
  isRefreshing: boolean;
  isTogglingWebService: boolean;
  onOpenCatalog: () => void;
  onSaveAudioSettings: (settings: FoundryAudioSettingsInput) => Promise<void>;
  onRefresh: () => Promise<void>;
  onRegisterEp: (epName?: string) => Promise<void>;
  onToggleWebService: () => Promise<void>;
  runtime: FoundryRuntimeView;
}) {
  const { resolvedTheme, setThemePreference, themePreference } = useTheme();
  const unregisteredProviders = props.runtime.executionProviders.filter((provider) => !provider.isRegistered);
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
  const selectedDeviceValue = props.audioSettings.selectedInputDeviceId === null ? 'default' : String(props.audioSettings.selectedInputDeviceId);

  const updateAudioSettings = (partial: Partial<FoundryAudioSettingsInput>) => {
    void props.onSaveAudioSettings({
      selectedInputDeviceId: props.audioSettings.selectedInputDeviceId,
      sampleRate: props.audioSettings.sampleRate,
      channels: props.audioSettings.channels,
      bitsPerSample: props.audioSettings.bitsPerSample,
      language: props.audioSettings.language,
      ...partial
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 py-4 sm:px-6 sm:py-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Settings & Runtime</h1>
          <p className="text-sm text-muted-foreground">Theme, local web service, and execution provider controls.</p>
        </div>
        <CatalogButton active={props.isCatalogOpen} onClick={props.onOpenCatalog} />
      </div>

      <Card className={panelSurfaceClassName}>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>Theme defaults to the system appearance until you choose an explicit override.</CardDescription>
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
                      <span className="block break-words text-sm font-medium text-foreground">{option.label}</span>
                      <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{option.description}</p>
                    </div>
                  </div>
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className={panelSurfaceClassName}>
        <CardHeader>
          <CardTitle>Audio</CardTitle>
          <CardDescription>Choose the microphone and capture format used for live transcription sessions.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="audio-input-device">Input device</label>
            <select
              id="audio-input-device"
              value={selectedDeviceValue}
              disabled={props.isSavingAudioSettings}
              className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
              onChange={(event) => {
                updateAudioSettings({
                  selectedInputDeviceId: event.target.value === 'default' ? null : Number(event.target.value)
                });
              }}
            >
              <option value="default">System default input</option>
              {props.audioSettings.availableInputDevices.map((device) => (
                <option key={device.id} value={String(device.id)}>
                  {device.name} ({device.hostApiName})
                </option>
              ))}
            </select>
            {props.audioSettings.deviceAccessError ? <p className="text-xs text-destructive">{props.audioSettings.deviceAccessError}</p> : <p className="text-xs text-muted-foreground">Available devices are discovered in the Electron main process with `naudiodon2`.</p>}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="audio-language">Language hint</label>
            <Input
              id="audio-language"
              value={props.audioSettings.language}
              disabled={props.isSavingAudioSettings}
              placeholder="en"
              onChange={(event) => {
                updateAudioSettings({ language: event.target.value });
              }}
            />
            <p className="text-xs text-muted-foreground">Optional BCP-47 hint such as `en` or `fr`.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="audio-sample-rate">Sample rate</label>
            <Input
              id="audio-sample-rate"
              type="number"
              min={8000}
              step={1000}
              value={props.audioSettings.sampleRate}
              disabled={props.isSavingAudioSettings}
              onChange={(event) => {
                updateAudioSettings({ sampleRate: Number(event.target.value) || props.audioSettings.sampleRate });
              }}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="audio-channels">Channels</label>
            <Input
              id="audio-channels"
              type="number"
              min={1}
              max={2}
              step={1}
              value={props.audioSettings.channels}
              disabled={props.isSavingAudioSettings}
              onChange={(event) => {
                updateAudioSettings({ channels: Number(event.target.value) || props.audioSettings.channels });
              }}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="audio-bits-per-sample">Bits per sample</label>
            <select
              id="audio-bits-per-sample"
              value={String(props.audioSettings.bitsPerSample)}
              disabled={props.isSavingAudioSettings}
              className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
              onChange={(event) => {
                updateAudioSettings({ bitsPerSample: event.target.value === '32' ? 32 : 16 });
              }}
            >
              <option value="16">16-bit PCM</option>
              <option value="32">32-bit PCM</option>
            </select>
          </div>
        </CardContent>
      </Card>

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
          <CardDescription>The embedded local web service is required for HTTP-backed SDK flows like `ResponsesClient`.</CardDescription>
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
          <CardDescription>Discover hardware-specific execution providers and register them when local acceleration is available.</CardDescription>
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

export { SettingsRuntimePage };
