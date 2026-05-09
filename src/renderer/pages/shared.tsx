import { LibraryBig } from 'lucide-react';
import { Button } from '@/components/ui/button';

const panelSurfaceClassName = 'bg-card/85 backdrop-blur supports-[backdrop-filter]:bg-card/75';

function CatalogButton(props: { active?: boolean; onClick: () => void }) {
  return (
    <Button type="button" variant={props.active ? 'secondary' : 'ghost'} onClick={props.onClick}>
      <LibraryBig className="size-4" />
      Catalog
    </Button>
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

export { CatalogButton, formatTimestamp, panelSurfaceClassName };
