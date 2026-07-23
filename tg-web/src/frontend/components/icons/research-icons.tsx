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
      {/* Sharp pit tile — Signal Floor rectangular chrome */}
      <rect width="32" height="32" rx="2" fill="currentColor" />
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="1.5"
        stroke="var(--sidebar-primary-foreground)"
        strokeOpacity="0.18"
      />
      {/* Ascending research bars */}
      <rect
        x="7"
        y="18"
        width="3.5"
        height="7"
        fill="var(--sidebar-primary-foreground)"
        fillOpacity="0.42"
      />
      <rect
        x="14.25"
        y="13"
        width="3.5"
        height="12"
        fill="var(--sidebar-primary-foreground)"
        fillOpacity="0.68"
      />
      <rect
        x="21.5"
        y="8"
        width="3.5"
        height="17"
        fill="var(--sidebar-primary-foreground)"
      />
      {/* Live signal through agent nodes */}
      <path
        d="M8.5 16.5h5.5L16.5 12.5 24 7"
        stroke="var(--sidebar-primary-foreground)"
        strokeOpacity="0.55"
        strokeWidth="1.5"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <rect
        x="7.4"
        y="15.4"
        width="2.2"
        height="2.2"
        fill="var(--sidebar-primary-foreground)"
      />
      <rect
        x="15.4"
        y="11.4"
        width="2.2"
        height="2.2"
        fill="var(--sidebar-primary-foreground)"
      />
      <rect
        x="22.9"
        y="5.9"
        width="2.2"
        height="2.2"
        fill="var(--sidebar-primary-foreground)"
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
