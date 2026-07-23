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
      {/* Pit tile */}
      <rect width="48" height="48" rx="3" fill="currentColor" />
      {/* Double wire rim */}
      <rect
        x="1.5"
        y="1.5"
        width="45"
        height="45"
        rx="2"
        stroke="#070a0e"
        strokeOpacity="0.14"
        strokeWidth="1"
      />
      <rect
        x="4"
        y="4"
        width="40"
        height="40"
        rx="1"
        stroke="#070a0e"
        strokeOpacity="0.1"
        strokeWidth="1"
      />

      {/* Baseline */}
      <path
        d="M12 36.5H36"
        stroke="#070a0e"
        strokeOpacity="0.22"
        strokeWidth="1"
        strokeLinecap="square"
      />
      <path
        d="M12 35.25V36.5M36 35.25V36.5"
        stroke="#070a0e"
        strokeOpacity="0.28"
        strokeWidth="1"
        strokeLinecap="square"
      />

      {/* Ascending research bars — optical spacing */}
      <rect
        x="13"
        y="24"
        width="5"
        height="12.5"
        fill="#070a0e"
        fillOpacity="0.34"
      />
      <rect
        x="21.5"
        y="17.5"
        width="5"
        height="19"
        fill="#070a0e"
        fillOpacity="0.58"
      />
      <rect
        x="30"
        y="11"
        width="5"
        height="25.5"
        fill="#070a0e"
        fillOpacity="0.88"
      />

      {/* Thin wick caps (candlestick hint) */}
      <path
        d="M15.5 21.5V24M24 14.5V17.5M32.5 8V11"
        stroke="#070a0e"
        strokeOpacity="0.4"
        strokeWidth="1"
        strokeLinecap="square"
      />

      {/* Live signal through agent nodes */}
      <path
        d="M15.5 21.5L24 14.5L32.5 8"
        stroke="#070a0e"
        strokeOpacity="0.55"
        strokeWidth="1.25"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      {/* Agent nodes */}
      <rect
        x="14.25"
        y="20.25"
        width="2.5"
        height="2.5"
        fill="#070a0e"
      />
      <rect x="22.75" y="13.25" width="2.5" height="2.5" fill="#070a0e" />
      <rect x="31.25" y="6.75" width="2.5" height="2.5" fill="#070a0e" />
      {/* Live tip */}
      <rect
        x="34.25"
        y="5.25"
        width="1.5"
        height="1.5"
        fill="#070a0e"
        fillOpacity="0.7"
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
