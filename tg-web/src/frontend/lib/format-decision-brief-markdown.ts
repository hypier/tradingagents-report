import { formatDecisionLabel } from '@/frontend/lib/format-decision';
import type {
  AnalysisDecision,
  DecisionPriceRange,
  DecisionSectionSignal,
} from '@/frontend/lib/research';

type Translate = (
  key: string,
  options?: { defaultValue?: string },
) => string;

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPrice(value: number, locale: string, currency: string | null) {
  return `${formatNumber(value, locale)}${currency ? ` ${currency}` : ''}`;
}

function formatRange(
  range: DecisionPriceRange,
  locale: string,
  currency: string | null,
) {
  return `${formatNumber(range.low, locale)}–${formatNumber(range.high, locale)}${
    currency ? ` ${currency}` : ''
  }`;
}

function pushField(lines: string[], label: string, value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return;
  lines.push(`- **${label}** · ${trimmed}`);
}

function pushParagraph(
  lines: string[],
  heading: string,
  value: string | null | undefined,
) {
  const trimmed = value?.trim();
  if (!trimmed) return;
  lines.push(`### ${heading}`, '', trimmed, '');
}

/**
 * Render a structured decision brief as Markdown for report export.
 * Returns an empty string when the decision has no brief headline.
 */
export function formatDecisionBriefMarkdown(
  decision: AnalysisDecision,
  options: {
    locale: string;
    sectionTitle: string;
    t: Translate;
    tCommon: Translate;
  },
): string {
  const headline = decision.headline?.trim();
  if (!headline) return '';

  const { locale, sectionTitle, t, tCommon } = options;
  const currency = decision.currency?.trim() || null;
  const rating = formatDecisionLabel(decision, tCommon);
  const lines: string[] = [`## ${sectionTitle}`, '', headline, ''];

  const meta: string[] = [];
  if (rating) {
    meta.push(`- **${rating}**`);
  }
  if (decision.conviction) {
    pushField(
      meta,
      t('decisionBrief.conviction'),
      t(`decisionBrief.levels.${decision.conviction}`),
    );
  }
  pushField(meta, t('decisionBrief.asOf'), decision.as_of_date);
  pushField(meta, t('decisionBrief.timeHorizon'), decision.time_horizon);
  if (meta.length) {
    lines.push(...meta, '');
  }

  const priceLines: string[] = [];
  if (typeof decision.as_of_price === 'number') {
    pushField(
      priceLines,
      t('decisionBrief.referencePrice'),
      formatPrice(decision.as_of_price, locale, currency),
    );
  }
  if (decision.entry_zone) {
    pushField(
      priceLines,
      t('decisionBrief.entryZone'),
      formatRange(decision.entry_zone, locale, currency),
    );
  }
  if (decision.add_levels?.length) {
    pushField(
      priceLines,
      t('decisionBrief.addLevels'),
      decision.add_levels
        .map((range) => formatRange(range, locale, currency))
        .join(' / '),
    );
  }
  if (typeof decision.stop_or_reduce === 'number') {
    pushField(
      priceLines,
      t('decisionBrief.stopOrReduce'),
      formatPrice(decision.stop_or_reduce, locale, currency),
    );
  }
  if (typeof decision.target_price === 'number') {
    pushField(
      priceLines,
      t('decisionBrief.targetPrice'),
      formatPrice(decision.target_price, locale, currency),
    );
  }
  if (priceLines.length) {
    lines.push(`### ${t('decisionBrief.pricePlan')}`, '', ...priceLines, '');
  }

  pushParagraph(
    lines,
    t('decisionBrief.positionGuidance'),
    decision.position_guidance,
  );
  pushParagraph(lines, t('decisionBrief.bullCase'), decision.bull_case);
  pushParagraph(lines, t('decisionBrief.bearCase'), decision.bear_case);
  pushParagraph(lines, t('decisionBrief.keyRisk'), decision.key_risk);
  pushParagraph(lines, t('decisionBrief.invalidation'), decision.invalidation);

  const watchItems = (decision.what_to_watch ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
  if (watchItems.length) {
    lines.push(
      `### ${t('decisionBrief.whatToWatch')}`,
      '',
      ...watchItems.map((item) => `- ${item}`),
      '',
    );
  }

  const signals = decision.section_stances
    ? (Object.entries(decision.section_stances) as [
        keyof NonNullable<AnalysisDecision['section_stances']>,
        DecisionSectionSignal,
      ][])
    : [];
  if (signals.length) {
    lines.push(`### ${t('decisionBrief.signalSummary')}`, '');
    for (const [key, signal] of signals) {
      const section = t(`decisionBrief.sections.${key}`);
      const stance = t(`decisionBrief.stances.${signal.stance}`);
      const note = signal.note?.trim();
      lines.push(
        note
          ? `- **${section}** · ${stance} — ${note}`
          : `- **${section}** · ${stance}`,
      );
    }
    lines.push('');
  }

  const conflict = decision.conflict_note?.trim();
  if (conflict) {
    lines.push(`**${t('decisionBrief.conflict')}:** ${conflict}`, '');
  }

  while (lines.at(-1) === '') lines.pop();
  return lines.join('\n');
}
