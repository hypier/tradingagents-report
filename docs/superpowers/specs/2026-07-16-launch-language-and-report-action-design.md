# Launch Language And Report Action Design

## Goal

Expose the Core CLI's report output-language choices in the web research form and make report viewing a direct icon action in the recent reports table.

## Scope

- Add an output-language field to the launch research form.
- Offer the CLI's preset languages: English, Chinese, Japanese, Korean, Hindi, Spanish, Portuguese, French, German, Arabic, and Russian.
- Offer a custom-language choice that reveals a required language-name field.
- Submit the selected language through the existing `configOverrides.output_language` request path.
- Replace each recent report's overflow menu with a visible `FileText` icon button that directly opens the report route.
- Provide a tooltip for the icon-only action.

## Boundaries

- The web backend, Core API schema, and job application code do not change because `output_language` is already an allowlisted configuration override.
- The form defaults to English to match the Core default.
- A blank custom language prevents submission rather than sending an invalid override.

## Testing

- Verify a selected preset language is sent under `configOverrides.output_language`.
- Verify selecting custom language exposes its input and blocks blank submission.
- Verify the direct report icon calls the existing report-open callback and exposes an accessible name and tooltip.
