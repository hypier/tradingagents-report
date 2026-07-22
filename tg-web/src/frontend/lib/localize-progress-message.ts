type Translate = (key: string, options?: Record<string, unknown>) => string;

const ACTOR_ALIASES: Record<string, string> = {
  'market analyst': 'marketAnalyst',
  'sentiment analyst': 'sentimentAnalyst',
  'news analyst': 'newsAnalyst',
  'fundamentals analyst': 'fundamentalsAnalyst',
  trader: 'trader',
  'portfolio manager': 'portfolioManager',
  'analyst team': 'analystTeam',
};

const RESEARCH_DEBATE_RE =
  /^Running research debate \((\d+)\/(\d+)\)$/u;
const RISK_DEBATE_RE = /^Running risk debate \((\d+)\/(\d+)\)$/u;
const CALLING_RE = /^(.+): calling ([A-Za-z0-9_]+)$/u;
const RUNNING_RE = /^Running (.+)$/u;
const COMPLETED_RE = /^(.+) completed$/u;

function actorLabel(actorKey: string, t: Translate) {
  return t(`home:pipeline.events.actors.${actorKey}`, {
    defaultValue: actorKey,
  });
}

function resolveActorKey(actor: string) {
  return ACTOR_ALIASES[actor.trim().toLowerCase()];
}

/**
 * Localize Core progress/event messages for the active UI language.
 * Unknown messages are returned unchanged. Tool names stay English.
 */
export function localizeProgressMessage(
  message: string | null | undefined,
  t: Translate,
): string {
  if (!message) return t('home:pipeline.stageUpdate');

  if (message === 'Running analyst team') {
    return t('home:pipeline.events.runningAnalystTeam');
  }
  if (message === 'Starting analysis') {
    return t('home:pipeline.events.starting');
  }
  if (message === 'Completed') {
    return t('home:pipeline.events.jobCompleted');
  }
  if (message === 'Failed') {
    return t('home:pipeline.events.jobFailed');
  }
  if (message === 'Stop requested') {
    return t('home:pipeline.events.stopRequested');
  }
  if (message === 'Stopping') {
    return t('home:pipeline.events.stopping');
  }
  if (message === 'Cancelled') {
    return t('home:pipeline.events.jobCancelled');
  }

  const researchDebate = message.match(RESEARCH_DEBATE_RE);
  if (researchDebate) {
    return t('home:pipeline.events.runningResearchDebate', {
      count: researchDebate[1],
      max: researchDebate[2],
    });
  }

  const riskDebate = message.match(RISK_DEBATE_RE);
  if (riskDebate) {
    return t('home:pipeline.events.runningRiskDebate', {
      count: riskDebate[1],
      max: riskDebate[2],
    });
  }

  const calling = message.match(CALLING_RE);
  if (calling) {
    const actorKey = resolveActorKey(calling[1]!);
    if (actorKey) {
      return t('home:pipeline.events.callingTool', {
        actor: actorLabel(actorKey, t),
        tool: calling[2],
      });
    }
  }

  const running = message.match(RUNNING_RE);
  if (running) {
    const actorKey = resolveActorKey(running[1]!);
    if (actorKey) {
      return t('home:pipeline.events.runningActor', {
        actor: actorLabel(actorKey, t),
      });
    }
  }

  const completed = message.match(COMPLETED_RE);
  if (completed) {
    const actorKey = resolveActorKey(completed[1]!);
    if (actorKey) {
      return t('home:pipeline.events.actorCompleted', {
        actor: actorLabel(actorKey, t),
      });
    }
  }

  return message;
}
