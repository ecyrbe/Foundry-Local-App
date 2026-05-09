import * as React from 'react';
import { cn } from '@/lib/utils';

type AccordionContextValue = {
  collapsible: boolean;
  onValueChange: (value: string) => void;
  value: string | null;
};

const AccordionContext = React.createContext<AccordionContextValue | null>(null);

type AccordionItemContextValue = {
  contentId: string;
  isOpen: boolean;
  triggerId: string;
  value: string;
};

const AccordionItemContext = React.createContext<AccordionItemContextValue | null>(null);

type AccordionProps = React.ComponentProps<'div'> & {
  collapsible?: boolean;
  onValueChange: (value: string | null) => void;
  type?: 'single';
  value: string | null;
};

function Accordion({ children, className, collapsible = false, onValueChange, type = 'single', value, ...props }: AccordionProps) {
  const contextValue = React.useMemo<AccordionContextValue>(() => ({
    collapsible,
    onValueChange: (nextValue) => {
      if (type !== 'single') {
        return;
      }

      onValueChange(collapsible && value === nextValue ? null : nextValue);
    },
    value
  }), [collapsible, onValueChange, type, value]);

  return (
    <AccordionContext.Provider value={contextValue}>
      <div className={cn('flex flex-col', className)} {...props}>
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

type AccordionItemProps = React.ComponentProps<'section'> & {
  value: string;
};

function AccordionItem({ children, className, value, ...props }: AccordionItemProps) {
  const accordionContext = React.useContext(AccordionContext);

  if (!accordionContext) {
    throw new Error('AccordionItem must be used within an Accordion.');
  }

  const contentId = React.useId();
  const triggerId = React.useId();
  const isOpen = accordionContext.value === value;

  return (
    <AccordionItemContext.Provider value={{ contentId, isOpen, triggerId, value }}>
      <section className={cn('min-h-0', className)} data-state={isOpen ? 'open' : 'closed'} {...props}>
        {children}
      </section>
    </AccordionItemContext.Provider>
  );
}

function AccordionTrigger({ children, className, onClick, ...props }: React.ComponentProps<'button'>) {
  const accordionContext = React.useContext(AccordionContext);
  const itemContext = React.useContext(AccordionItemContext);

  if (!accordionContext || !itemContext) {
    throw new Error('AccordionTrigger must be used within an AccordionItem.');
  }

  return (
    <button
      type="button"
      id={itemContext.triggerId}
      aria-controls={itemContext.contentId}
      aria-expanded={itemContext.isOpen}
      data-state={itemContext.isOpen ? 'open' : 'closed'}
      className={className}
      onClick={(event) => {
        onClick?.(event);

        if (!event.defaultPrevented) {
          accordionContext.onValueChange(itemContext.value);
        }
      }}
      {...props}
    >
      {children}
    </button>
  );
}

function AccordionContent({ children, className, ...props }: React.ComponentProps<'div'>) {
  const itemContext = React.useContext(AccordionItemContext);

  if (!itemContext) {
    throw new Error('AccordionContent must be used within an AccordionItem.');
  }

  return (
    <div
      id={itemContext.contentId}
      role="region"
      aria-labelledby={itemContext.triggerId}
      aria-hidden={!itemContext.isOpen}
      data-state={itemContext.isOpen ? 'open' : 'closed'}
      className={cn(
        'grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] data-[state=closed]:grid-rows-[0fr] data-[state=closed]:overflow-hidden data-[state=open]:grid-rows-[1fr] data-[state=open]:overflow-visible motion-reduce:transition-none',
        className
      )}
      {...props}
    >
      <div
        data-state={itemContext.isOpen ? 'open' : 'closed'}
        className="min-h-0 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] data-[state=closed]:-translate-y-1 data-[state=closed]:overflow-hidden data-[state=closed]:opacity-0 data-[state=open]:translate-y-0 data-[state=open]:overflow-visible data-[state=open]:opacity-100 motion-reduce:transition-none"
      >
        {children}
      </div>
    </div>
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
