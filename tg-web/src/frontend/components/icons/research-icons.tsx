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
      {/* Ascending research bars */}
      <rect
        x="7"
        y="17"
        width="4"
        height="7"
        rx="1.2"
        fill="var(--primary-foreground)"
        fillOpacity="0.55"
      />
      <rect
        x="14"
        y="12.5"
        width="4"
        height="11.5"
        rx="1.2"
        fill="var(--primary-foreground)"
        fillOpacity="0.78"
      />
      <rect
        x="21"
        y="8"
        width="4"
        height="16"
        rx="1.2"
        fill="var(--primary-foreground)"
      />
      {/* Agent nodes linked along the signal */}
      <path
        d="M9 15.5h5.2L16 12.2 23 7.2"
        stroke="var(--primary-foreground)"
        strokeOpacity="0.45"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="15.5" r="1.9" fill="var(--primary-foreground)" />
      <circle cx="16" cy="12.2" r="1.9" fill="var(--primary-foreground)" />
      <circle cx="23" cy="7.2" r="1.9" fill="var(--primary-foreground)" />
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
