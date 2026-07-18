import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BookOpenText,
  Bot,
  CandlestickChart,
  CircleAlert,
  ClipboardList,
  Globe2,
  Languages,
  LineChart,
  MessageSquareQuote,
  Newspaper,
  Scale,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  Workflow,
} from 'lucide-react';

export const analystIcons: Record<string, LucideIcon> = {
  market: CandlestickChart,
  fundamentals: BookOpenText,
  news: Newspaper,
  social: MessageSquareQuote,
};

export const stageIcons: Record<string, LucideIcon> = {
  market: CandlestickChart,
  fundamentals: BookOpenText,
  news: Newspaper,
  social: MessageSquareQuote,
  research_debate: Users,
  trader: TrendingUp,
  risk_review: ShieldAlert,
  final_synthesis: Sparkles,
};

export function getAnalystIcon(key: string): LucideIcon {
  return analystIcons[key] ?? Bot;
}

export function getStageIcon(key: string): LucideIcon {
  return stageIcons[key] ?? Workflow;
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path
        d="M8 21.5V10.5h3.1c2.55 0 4.15 1.35 4.15 3.45 0 1.32-.7 2.4-1.85 2.95L17.6 21.5h-3.05l-3.2-4.2H11v4.2H8Zm3-6.55h.95c1.05 0 1.7-.55 1.7-1.45s-.65-1.4-1.7-1.4H11v2.85Z"
        fill="var(--primary-foreground)"
      />
      <path
        d="M18.2 21.5 21.05 10.5h3.05L27 21.5h-2.85l-.45-1.7h-2.95l-.5 1.7H18.2Zm4.15-3.95h2.05l-1-3.75-1.05 3.75Z"
        fill="var(--primary-foreground)"
        fillOpacity="0.88"
      />
      <path
        d="M7.5 24h17"
        stroke="var(--primary-foreground)"
        strokeOpacity="0.35"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export {
  Activity,
  CircleAlert,
  ClipboardList,
  Globe2,
  Languages,
  LineChart,
  Scale,
  Workflow,
};
