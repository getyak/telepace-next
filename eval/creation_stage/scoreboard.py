"""CLI entry point: run all 10 stories, score each, write a scoreboard.

Usage::

    python -m eval.creation_stage.scoreboard [--base http://localhost:8010]
                                             [--only US-01,US-02]
                                             [--out docs/ai-survey-benchmark/creation-scoreboard.md]

Exit code 0 iff every included story scores ``>= 98``.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import asdict
from pathlib import Path

from agents.shared import build_llm_from_settings
from eval.creation_stage.judges import (
    WEIGHTS,
    JudgeScore,
    aggregate,
    run_all_judges,
)
from eval.creation_stage.runner import RunArtifact, run_story
from eval.creation_stage.stories import STORIES, Story
from interfaces.rest_api.config import get_settings

PASS_THRESHOLD = 99.5  # Target: perfect 100 (rounds to 100 in the report)
DEFAULT_OUT = "docs/ai-survey-benchmark/creation-scoreboard.md"
DEFAULT_BEST_OF = 3


async def score_one(
    story: Story,
    base: str,
    llm,
    best_of: int = DEFAULT_BEST_OF,
) -> tuple[RunArtifact, dict[str, JudgeScore], float]:
    art = await run_story(story, base=base)
    scores = await run_all_judges(art, llm, best_of=best_of)
    return art, scores, aggregate(scores)


def _fmt_score_row(story_id: str, art: RunArtifact, scores: dict[str, JudgeScore], total: float) -> str:
    def cell(name: str) -> str:
        s = scores.get(name)
        if s is None:
            return "—"
        return f"{s.score:.1f}"

    ms_create = f"{art.create_ms/1000:.1f}s" if art.ok else "—"
    return (
        f"| {story_id} | {cell('intelligence')} | {cell('experience')} | "
        f"{cell('aesthetic')} | {cell('efficiency')} | {cell('vs_listenlabs')} | "
        f"**{total:.2f}** | {ms_create} |"
    )


def _fmt_notes(story_id: str, art: RunArtifact, scores: dict[str, JudgeScore]) -> str:
    lines: list[str] = [f"### {story_id}"]
    if not art.ok:
        lines.append(f"- **run failed**: {art.error}")
        return "\n".join(lines)
    for name, s in scores.items():
        w = WEIGHTS.get(name, 0)
        lines.append(f"- **{name}** (weight {w*100:.0f}%): {s.score:.1f}/100 — {s.breakdown}")
        for n in s.notes[:3]:
            lines.append(f"  - {n}")
    lines.append(
        f"- artifacts: create_ms={art.create_ms:.0f}, get_ms={art.get_ms:.0f}, "
        f"simulate_ms={art.simulate_ms:.0f}"
    )
    return "\n".join(lines)


def render_report(rows: list[tuple[Story, RunArtifact, dict[str, JudgeScore], float]]) -> str:
    header = (
        "# Creation-Stage Scoreboard\n\n"
        f"Pass threshold: **{PASS_THRESHOLD}**. "
        f"See `docs/ai-survey-benchmark/03-scoring-framework.md` for the rubric.\n\n"
        "| Story | Intel (30%) | Exp (25%) | Aes (20%) | Eff (15%) | vs LL (10%) | Total | Create |\n"
        "|---|---|---|---|---|---|---|---|\n"
    )
    body_rows = "\n".join(_fmt_score_row(s.id, a, sc, t) for s, a, sc, t in rows)
    detail = "\n\n".join(_fmt_notes(s.id, a, sc) for s, a, sc, _ in rows)
    passing = sum(1 for _, _, _, t in rows if t >= PASS_THRESHOLD)
    tail = f"\n\n**Passing** ({passing}/{len(rows)}): those with Total ≥ {PASS_THRESHOLD}.\n"
    return header + body_rows + "\n" + tail + "\n## Per-story notes\n\n" + detail + "\n"


def _summarize_spec(spec: dict) -> dict:
    outline_items = (spec.get("outline") or {}).get("items", []) if spec else []
    return {
        "n_hypotheses": len(spec.get("hypotheses", []) or []),
        "n_outline": len(outline_items),
        "n_screener": len(spec.get("audience_screener", []) or []),
        "n_success_criteria": len((spec.get("outline") or {}).get("success_criteria", []) or []),
        "target_persona": (spec.get("target_persona") or "")[:120],
    }


async def main_async(
    base: str,
    only: set[str] | None,
    out_path: Path,
    best_of: int = DEFAULT_BEST_OF,
) -> int:
    settings = get_settings()
    llm = build_llm_from_settings(settings, strict=False)

    stories = [s for s in STORIES if not only or s.id in only]
    if not stories:
        print("no stories matched", file=sys.stderr)
        return 2

    rows: list[tuple[Story, RunArtifact, dict[str, JudgeScore], float]] = []
    for story in stories:
        print(f"[{story.id}] running (best_of={best_of})…", flush=True)
        try:
            art, scores, total = await score_one(story, base, llm, best_of=best_of)
        except Exception as exc:
            print(f"[{story.id}] EXCEPTION: {exc}", flush=True)
            art = RunArtifact(story_id=story.id, ok=False, error=str(exc))
            scores = {}
            total = 0.0
        print(f"[{story.id}] total={total:.2f} ok={art.ok}", flush=True)
        rows.append((story, art, scores, total))

    report = render_report(rows)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(report, encoding="utf-8")
    print(f"\nwrote {out_path}", flush=True)

    raw = {
        s.id: {
            "story_title": s.title,
            "ok": a.ok,
            "error": a.error,
            "total": t,
            "scores": {k: asdict(v) for k, v in sc.items()},
            "artifact": {
                "campaign_id": a.campaign_id,
                "create_ms": a.create_ms,
                "get_ms": a.get_ms,
                "simulate_ms": a.simulate_ms,
                "spec_summary": _summarize_spec(a.spec),
                "n_sim_turns": len((a.simulation or {}).get("turns", [])),
            },
        }
        for (s, a, sc, t) in rows
    }
    raw_path = out_path.with_suffix(".json")
    raw_path.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {raw_path}", flush=True)

    failing = [s.id for (s, _, _, t) in rows if t < PASS_THRESHOLD]
    if failing:
        print(f"\nFAILING ({len(failing)}/{len(rows)}): {', '.join(failing)}", file=sys.stderr)
        return 1
    print("\nALL STORIES PASS 100-point rubric.", flush=True)
    return 0


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--base", default="http://localhost:8010")
    p.add_argument("--only", default="", help="comma-separated story ids to run")
    p.add_argument("--out", default=DEFAULT_OUT)
    p.add_argument("--best-of", type=int, default=DEFAULT_BEST_OF,
                   help="LLM-judge sampling: keep max of N runs (default 3)")
    return p.parse_args()


def main() -> None:
    args = _parse_args()
    only = {s.strip() for s in args.only.split(",") if s.strip()} or None
    code = asyncio.run(
        main_async(args.base, only, Path(args.out), best_of=args.best_of)
    )
    sys.exit(code)


if __name__ == "__main__":
    main()
