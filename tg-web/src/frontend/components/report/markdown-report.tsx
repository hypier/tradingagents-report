import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function renderValue(value: unknown) {
  return typeof value === 'string'
    ? value
    : (JSON.stringify(value, null, 2) ?? '');
}

export function MarkdownReport({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return (
      <pre className="overflow-hidden whitespace-pre-wrap break-words rounded-md bg-muted p-4 font-mono text-xs leading-6">
        {renderValue(value)}
      </pre>
    );
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="mt-8 mb-4 text-2xl font-semibold first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mt-8 mb-3 text-xl font-semibold first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mt-6 mb-2 text-lg font-semibold">{children}</h3>
        ),
        p: ({ children }) => <p className="my-4 leading-7">{children}</p>,
        a: ({ children, href }) => (
          <a
            className="text-primary underline underline-offset-4"
            href={href}
            rel="noreferrer"
            target="_blank"
          >
            {children}
          </a>
        ),
        ul: ({ children }) => (
          <ul className="my-4 list-disc space-y-2 pl-6">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="my-4 list-decimal space-y-2 pl-6">{children}</ol>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-4 border-l-2 border-primary pl-4 text-muted-foreground">
            {children}
          </blockquote>
        ),
        code: ({ children, className }) => (
          <code
            className={`rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] ${className ?? ''}`}
          >
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="my-4 overflow-hidden whitespace-pre-wrap break-words rounded-md bg-muted p-4 text-xs leading-6">
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <table className="my-4 w-full table-fixed text-left text-sm break-words">
            {children}
          </table>
        ),
        th: ({ children }) => (
          <th className="border-b bg-muted px-3 py-2 align-top font-medium break-words">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-b px-3 py-2 align-top break-words">
            {children}
          </td>
        ),
      }}
    >
      {value}
    </ReactMarkdown>
  );
}
