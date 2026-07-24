"""Shared 5-tier rating vocabulary and a deterministic heuristic parser.

The same five-tier scale (Buy, Overweight, Hold, Underweight, Sell) is used by:
- The Research Manager (investment plan recommendation)
- The Portfolio Manager (final position decision)
- The signal processor (rating extracted for downstream consumers)
- The memory log (rating tag stored alongside each decision entry)

Centralising it here avoids drift between those call sites.
"""

from __future__ import annotations

import re

from tradingagents.agents.utils.report_i18n import (
    rating_label_spellings,
    rating_value_aliases,
)

# Canonical, ordered 5-tier scale (most bullish to most bearish).
RATINGS_5_TIER: tuple[str, ...] = (
    "Buy", "Overweight", "Hold", "Underweight", "Sell",
)

# English + all locale-pack display forms produced by localized render helpers.
_RATING_ALIASES: dict[str, str] = rating_value_aliases()

# Escape for regex alternation; longer labels first so multi-word forms win.
_RATING_LABEL_PATTERN = "|".join(
    sorted(
        (re.escape(label) for label in rating_label_spellings()),
        key=len,
        reverse=True,
    )
)

# Matches "Rating: X" / "评级：增持" / "권고: 매수" — tolerates markdown bold
# wrappers and either a colon, fullwidth colon, or hyphen separator.
_RATING_LABEL_RE = re.compile(
    rf"(?:{_RATING_LABEL_PATTERN}).*?[:：\-][\s*]*([^\s*]+)",
    re.IGNORECASE,
)


def _canonical_rating(token: str) -> str | None:
    cleaned = token.strip("*:.,，。")
    if not cleaned:
        return None
    return _RATING_ALIASES.get(cleaned) or _RATING_ALIASES.get(cleaned.lower())


def parse_rating(text: str, default: str = "Hold") -> str:
    """Heuristically extract a 5-tier rating from prose text.

    Two-pass strategy:
    1. Look for an explicit rating/recommendation label (any known locale).
    2. Fall back to the first known rating token found anywhere in the text.

    Returns a canonical English rating string, or ``default`` if none appear.
    """
    for line in text.splitlines():
        m = _RATING_LABEL_RE.search(line)
        if m:
            rating = _canonical_rating(m.group(1))
            if rating:
                return rating

    for line in text.splitlines():
        for word in line.split():
            rating = _canonical_rating(word)
            if rating:
                return rating
        # CJK / non-spaced scripts may glue the token without ASCII whitespace.
        # Only scan non-ASCII aliases here so English substrings like
        # "hold" inside "shareholder" cannot false-match.
        for alias, canonical in _RATING_ALIASES.items():
            if alias.isascii():
                continue
            if alias in line:
                return canonical

    return default
