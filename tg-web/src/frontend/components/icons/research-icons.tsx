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
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Pit tile + single hairline rim */}
      <rect width="48" height="48" rx="3" fill="currentColor" />
      <rect
        x="2"
        y="2"
        width="44"
        height="44"
        rx="2"
        stroke="#070a0e"
        strokeOpacity="0.16"
        strokeWidth="1"
      />

      {/* Ascending bars */}
      <rect
        x="13"
        y="25"
        width="5"
        height="11"
        fill="#070a0e"
        fillOpacity="0.32"
      />
      <rect
        x="21.5"
        y="18"
        width="5"
        height="18"
        fill="#070a0e"
        fillOpacity="0.55"
      />
      <rect
        x="30"
        y="11"
        width="5"
        height="25"
        fill="#070a0e"
        fillOpacity="0.9"
      />

      {/* Signal line + nodes */}
      <path
        d="M15.5 22.5L24 15.5L32.5 9"
        stroke="#070a0e"
        strokeOpacity="0.5"
        strokeWidth="1.5"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <rect x="14.25" y="21.25" width="2.5" height="2.5" fill="#070a0e" />
      <rect x="22.75" y="14.25" width="2.5" height="2.5" fill="#070a0e" />
      <rect x="31.25" y="7.75" width="2.5" height="2.5" fill="#070a0e" />
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
