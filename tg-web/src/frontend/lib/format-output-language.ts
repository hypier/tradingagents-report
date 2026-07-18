/** Canonical Core/API values for known report output languages. */
export const OUTPUT_LANGUAGE_IDS = [
  'English',
  'Chinese',
  'Japanese',
  'Korean',
  'Hindi',
  'Spanish',
  'Portuguese',
  'French',
  'German',
  'Arabic',
  'Russian',
] as const;

export type OutputLanguageId = (typeof OUTPUT_LANGUAGE_IDS)[number];

const OUTPUT_LANGUAGE_ALIASES: Record<string, OutputLanguageId> = {
  english: 'English',
  chinese: 'Chinese',
  中文: 'Chinese',
  japanese: 'Japanese',
  日本語: 'Japanese',
  korean: 'Korean',
  한국어: 'Korean',
  hindi: 'Hindi',
  हिन्दी: 'Hindi',
  spanish: 'Spanish',
  español: 'Spanish',
  portuguese: 'Portuguese',
  português: 'Portuguese',
  french: 'French',
  français: 'French',
  german: 'German',
  deutsch: 'German',
  arabic: 'Arabic',
  العربية: 'Arabic',
  russian: 'Russian',
  русский: 'Russian',
};

export function normalizeOutputLanguageId(
  value?: string | null,
): OutputLanguageId | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if ((OUTPUT_LANGUAGE_IDS as readonly string[]).includes(trimmed)) {
    return trimmed as OutputLanguageId;
  }

  return OUTPUT_LANGUAGE_ALIASES[trimmed.toLowerCase()] ?? null;
}

type Translate = (
  key: string,
  options?: { defaultValue?: string },
) => string;

/** Localize a stored report output language for UI display. */
export function formatOutputLanguage(
  value: string | null | undefined,
  t: Translate,
  fallback = '',
) {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;

  const id = normalizeOutputLanguageId(trimmed);
  if (!id) return trimmed;

  return t(`outputLanguages.${id}`, { defaultValue: trimmed });
}
