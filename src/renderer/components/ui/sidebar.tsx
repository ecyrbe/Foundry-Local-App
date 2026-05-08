import * as React from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type SidebarProps = React.ComponentProps<'aside'> & {
  collapsed: boolean;
  onToggle: () => void;
};

function Sidebar({ children, className, collapsed, onToggle, ...props }: SidebarProps) {
  return (
    <aside
      className={cn(
        'relative flex h-full min-w-0 flex-col border-r border-border/70 bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/80 transition-[width] duration-200',
        collapsed ? 'w-[76px]' : 'w-[280px]',
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-end px-3 pt-3">
        <Button type="button" variant="ghost" size="icon" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={onToggle}>
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </Button>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </aside>
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('px-4 pb-4', className)} {...props} />;
}

function SidebarContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex min-h-0 flex-1 flex-col px-3 pb-4', className)} {...props} />;
}

function SidebarNav({ className, ...props }: React.ComponentProps<'nav'>) {
  return <nav className={cn('flex flex-col gap-2', className)} {...props} />;
}

export { Sidebar, SidebarContent, SidebarHeader, SidebarNav };
