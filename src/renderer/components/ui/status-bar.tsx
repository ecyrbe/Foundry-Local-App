import * as React from 'react';
import { cn } from '@/lib/utils';

function StatusBar({ className, ...props }: React.ComponentProps<'footer'>) {
  return <footer className={cn('shrink-0 border-t border-border/70 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90', className)} {...props} />;
}

function StatusBarContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex min-h-9 flex-wrap items-center gap-2 px-3 py-1.5 text-xs', className)} {...props} />;
}

export { StatusBar, StatusBarContent };
