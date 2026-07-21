import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/frontend/lib/utils';

function renderValue(value: unknown) {
  return typeof value === 'string'
    ? value
    : (JSON.stringify(value, null, 2) ?? '');
}

export function MarkdownReport({
  value,
  className,
}: {
  value: unknown;
  className?: string;
}) {
  if (typeof value !== 'string') {
    return (
      <pre className="overflow-hidden whitespace-pre-wrap break-words rounded-none bg-[var(--report-highlight,theme(colors.muted))] p-4 font-mono text-sm leading-6 text-foreground">
        {renderValue(value)}
      </pre>
    );
  }

  return (
    <div
      className={cn(
        'report-prose text-[length:var(--report-font-size,1.05rem)] leading-[1.8] text-foreground',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-10 mb-5 text-[1.65em] leading-tight font-semibold tracking-tight text-foreground first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-10 mb-4 border-b border-border/70 pb-2 text-[1.3em] leading-snug font-semibold tracking-tight text-foreground first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-8 mb-3 text-[1.15em] leading-snug font-semibold tracking-tight text-foreground">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-6 mb-2 text-[1.05em] font-semibold tracking-tight text-foreground">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="my-5 text-pretty text-foreground/92">{children}</p>
          ),
          a: ({ children, href }) => (
            <a
              className="font-medium text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary"
              href={href}
              rel="noreferrer"
              target="_blank"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="my-5 list-disc space-y-2.5 pl-6 marker:text-primary/70">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-5 list-decimal space-y-2.5 pl-6 marker:font-medium marker:text-muted-foreground">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="pl-1 text-pretty [&>p]:my-2">{children}</li>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-foreground/90">{children}</em>
          ),
          hr: () => <hr className="my-10 border-border/80" />,
          blockquote: ({ children }) => (
            <blockquote className="my-6 border-l-[3px] border-primary/50 bg-[var(--report-highlight-soft,theme(colors.muted)/0.4)] py-1 pl-5 text-[0.98em] leading-relaxed text-muted-foreground">
              {children}
            </blockquote>
          ),
          code: ({ children, className: codeClassName }) => {
            const isBlock = Boolean(codeClassName);
            if (isBlock) {
              return <code className={codeClassName}>{children}</code>;
            }
            return (
              <code className="rounded-none bg-[var(--report-highlight,#efece4)] px-1.5 py-0.5 font-mono text-[0.86em] text-foreground ring-1 ring-foreground/10">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-6 overflow-x-auto whitespace-pre-wrap break-words rounded-none border border-border bg-[var(--report-highlight-soft,#f5f2ea)] p-4 font-mono text-[0.86em] leading-6 text-foreground">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-6 overflow-x-auto rounded-none border border-border">
              <table className="w-full table-fixed text-left text-[0.95em] break-words">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[var(--report-highlight-soft,#f5f2ea)]">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="border-b border-border px-3.5 py-2.5 align-top font-semibold break-words">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border px-3.5 py-2.5 align-top break-words">
              {children}
            </td>
          ),
        }}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}
