import { useTranslation } from 'react-i18next';

import { Badge } from '@/frontend/components/ui/badge';
import {
  decisionBadgeVariant,
  formatDecisionLabel,
} from '@/frontend/lib/format-decision';
import type { AnalysisDecision } from '@/frontend/lib/research';

export function DecisionSummary({
  decision,
}: {
  decision: string | AnalysisDecision | null | undefined;
}) {
  const { t } = useTranslation(['reports', 'common']);
  const label = formatDecisionLabel(decision, (key, options) =>
    t(`common:${key}`, options),
  );

  if (!label) {
    return (
      <span className="text-xs text-muted-foreground">
        {t('reports:table.noConclusion')}
      </span>
    );
  }

  return (
    <Badge variant={decisionBadgeVariant(decision)} className="shrink-0">
      {label}
    </Badge>
  );
}
