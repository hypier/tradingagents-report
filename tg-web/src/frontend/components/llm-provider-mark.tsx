import { useState } from 'react';

import { llmProviderLogoUrl } from '@/shared/llm-provider-logos';
import { cn } from '@/frontend/lib/utils';

type LlmProviderMarkProps = {
  providerId: string;
  className?: string;
};

/**
 * Provider mark from models.dev SVG logos (same catalog used for price sync).
 * Rendered as a CSS mask so `currentColor` SVGs follow theme foreground.
 */
export function LlmProviderMark({
  providerId,
  className,
}: LlmProviderMarkProps) {
  const [failed, setFailed] = useState(false);
  const logoUrl = llmProviderLogoUrl(providerId);
  const initial = (providerId.slice(0, 1) || '?').toUpperCase();

  return (
    <span
      className={cn(
        'relative inline-flex size-8 shrink-0 items-center justify-center border border-border bg-muted/40 text-xs font-semibold',
        className,
      )}
      aria-hidden
    >
      {!failed ? (
        <>
          <img
            src={logoUrl}
            alt=""
            width={1}
            height={1}
            className="pointer-events-none absolute size-px opacity-0"
            onError={() => setFailed(true)}
          />
          <span
            className="size-[18px] bg-foreground"
            style={{
              maskImage: `url(${logoUrl})`,
              maskSize: 'contain',
              maskRepeat: 'no-repeat',
              maskPosition: 'center',
              WebkitMaskImage: `url(${logoUrl})`,
              WebkitMaskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
            }}
          />
        </>
      ) : (
        <span className="text-muted-foreground">{initial}</span>
      )}
    </span>
  );
}
