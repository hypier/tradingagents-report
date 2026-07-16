# Report Detail Page Design

## Goal

Replace the dashboard report dialog with a dedicated, readable report page that renders the Core analysis report as Markdown.

## Scope

- Add a client route at `/reports/:id`.
- Keep the existing sidebar and site header around the report page.
- Navigate to the route from the recent reports action menu.
- Fetch the existing analysis detail through `getResearch(id)`.
- Preserve the existing report sections as horizontally scrollable tabs.
- Render string reports as Markdown, including headings, emphasis, lists, blockquotes, code blocks, and tables.
- Serialize non-string reports as formatted JSON before rendering them as code content.
- Preserve the current loading, request failure, and empty-report states.

## Components And Data Flow

`RecentReports` receives a navigation callback from `HomePage`. Selecting "View report" navigates to `/reports/:id`.

`ReportPage` reads the route parameter, calls `getResearch(id)`, and displays the report title, ticker, status, back action, and report tabs. A small Markdown rendering component converts each report value into readable document content. No backend routes, schemas, or report payloads change.

## Error Handling

An absent route identifier, failed detail request, and report with no entries use the existing alert or empty-state components. The page must not attempt a request when the identifier is missing.

## Testing

- A route test proves `/reports/:id` renders the report page within the existing app shell.
- A component test proves Markdown headings and a table render as semantic HTML rather than raw source text.
- Existing frontend unit tests, TypeScript checks, linting, and production build remain green.
