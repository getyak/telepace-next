"""Scoreboard writer for the 12-dim rubric across all 10 scenarios.

CLI:
    python -m eval.ci.scoreboard --out docs/scoreboard.md [--fail-under 10.5]

Reads:
    eval/datasets/scenarios/S*/seed.json   -> scenario list
    eval/results/S{n}.json                  -> serialized RubricEvidence per scenario
    docs/scoreboard.md @ HEAD               -> previous run for regression comparison

Writes a Markdown table (rows=scenarios, cols=12 dims + median + trend) to
`--out`, and exits 1 if any median is below `--fail-under` OR if any dim
regressed by >=1.0 vs. the previous commit.
"""

from __future__ import annotations

import argparse
import asyncio
import dataclasses
import importlib
import json
import logging
import re
import statistics
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

from eval.judges.types import RubricEvidence, Score

log = logging.getLogger("scoreboard")

REPO_ROOT = Path(__file__).resolve().parents[2]
SCENARIOS_DIR = REPO_ROOT / "eval" / "datasets" / "scenarios"
RESULTS_DIR = REPO_ROOT / "eval" / "results"

DIM_MODULES: list[tuple[int, str]] = [
    (1, "eval.judges.dim01_time_to_first_question"),
    (2, "eval.judges.dim02_build_fluency"),
    (3, "eval.judges.dim03_voice_latency"),
    (4, "eval.judges.dim04_voice_groundedness"),
    (5, "eval.judges.dim05_channel_coverage"),
    (6, "eval.judges.dim06_coverage_tracking"),
    (7, "eval.judges.dim07_pii_policy_safety"),
    (8, "eval.judges.dim08_insight_quality"),
    (9, "eval.judges.dim09_cost_per_completion"),
    (10, "eval.judges.dim10_time_to_insight"),
    (11, "eval.judges.dim11_ops_observability"),
    (12, "eval.judges.dim12_aesthetic_polish"),
]

from core.constants import (
    SCOREBOARD_CONCURRENCY,
    SCOREBOARD_FAIL_UNDER,
    SCOREBOARD_REGRESSION_THRESHOLD,
)

CONCURRENCY = SCOREBOARD_CONCURRENCY
REGRESSION_THRESHOLD = SCOREBOARD_REGRESSION_THRESHOLD  # dim drop >= threshold vs. prior commit


def discover_scenarios() -> list[str]:
    ids: list[str] = []
    if not SCENARIOS_DIR.exists():
        return ids
    for p in sorted(SCENARIOS_DIR.iterdir()):
        if p.is_dir() and (p / "seed.json").is_file():
            ids.append(p.name)
    # Natural sort: S1, S2, ..., S10
    ids.sort(key=lambda s: int(re.sub(r"\D", "", s) or "0"))
    return ids


def load_evidence(scenario_id: str) -> RubricEvidence | None:
    path = RESULTS_DIR / f"{scenario_id}.json"
    if not path.is_file():
        log.warning("no evidence file for %s at %s", scenario_id, path)
        return None
    try:
        raw = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        log.warning("bad JSON for %s: %s", scenario_id, exc)
        return None
    known = {f.name for f in dataclasses.fields(RubricEvidence)}
    filtered = {k: v for k, v in raw.items() if k in known}
    filtered.setdefault("scenario_id", scenario_id)
    return RubricEvidence(**filtered)


def _no_evidence_scores(scenario_id: str) -> list[Score]:
    return [
        Score(
            dim=d,
            scenario_id=scenario_id,
            score=0.0,
            rationale="no evidence file — E2E driver has not run",
            evidence_pointer=f"eval/results/{scenario_id}.json (missing)",
        )
        for d, _ in DIM_MODULES
    ]


async def _score_one(
    dim: int, module_name: str, evidence: RubricEvidence, sem: asyncio.Semaphore
) -> Score:
    async with sem:
        try:
            mod = importlib.import_module(module_name)
            return await mod.judge(evidence)
        except Exception as exc:  # pragma: no cover
            return Score(
                dim=dim,
                scenario_id=evidence.scenario_id,
                score=0.0,
                rationale=f"judge crashed: {exc.__class__.__name__}: {exc}",
                evidence_pointer=f"eval/results/{evidence.scenario_id}.json",
            )


async def score_scenarios(scenario_ids: list[str]) -> dict[str, list[Score]]:
    sem = asyncio.Semaphore(CONCURRENCY)
    tasks: list[tuple[str, int, asyncio.Task[Score]]] = []
    scores: dict[str, list[Score]] = {}
    for sid in scenario_ids:
        evidence = load_evidence(sid)
        if evidence is None:
            scores[sid] = _no_evidence_scores(sid)
            continue
        scores[sid] = []
        for dim, module_name in DIM_MODULES:
            task = asyncio.create_task(_score_one(dim, module_name, evidence, sem))
            tasks.append((sid, dim, task))
    for sid, dim, task in tasks:
        s = await task
        scores[sid].append(s)
    # Ensure per-scenario score list is dim-ordered.
    for sid in scores:
        scores[sid].sort(key=lambda s: s.dim)
    return scores


def _git_head_meta() -> tuple[str, str]:
    try:
        sha = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=REPO_ROOT, text=True).strip()
        msg = subprocess.check_output(
            ["git", "log", "-1", "--pretty=%s"], cwd=REPO_ROOT, text=True
        ).strip()
    except Exception:
        return "unknown", "(no git history)"
    return sha, msg


def _load_prior_scoreboard(path: Path) -> str | None:
    try:
        out = subprocess.check_output(
            ["git", "show", f"HEAD:{path.relative_to(REPO_ROOT)}"],
            cwd=REPO_ROOT,
            text=True,
            stderr=subprocess.DEVNULL,
        )
        return out
    except (subprocess.CalledProcessError, ValueError):
        return None


def _parse_prior_table(md: str) -> dict[str, dict[int, float]]:
    """Extract {scenario_id: {dim: score}} from a previously written scoreboard.md."""
    prior: dict[str, dict[int, float]] = {}
    if not md:
        return prior
    for line in md.splitlines():
        line = line.strip()
        if not line.startswith("| S") or "|" not in line:
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) < 13:
            continue
        sid = cells[0]
        prior[sid] = {}
        for idx, cell in enumerate(cells[1:13], start=1):
            try:
                prior[sid][idx] = float(cell)
            except ValueError:
                # "—" or similar: skip so it doesn't look like a regression.
                continue
    return prior


def _fmt_score(v: float) -> str:
    return f"{v:.1f}"


def _median(vals: list[float]) -> float:
    return float(statistics.median(vals)) if vals else 0.0


def render_markdown(
    scores: dict[str, list[Score]],
    prior: dict[str, dict[int, float]],
    fail_under: float,
) -> tuple[str, list[str]]:
    """Return (markdown, list of regression/failure messages)."""
    sha, msg = _git_head_meta()
    ts = datetime.now(UTC).isoformat(timespec="seconds")
    lines: list[str] = []
    lines.append("# Scoreboard")
    lines.append("")
    lines.append(f"- **Commit**: `{sha}` — {msg}")
    lines.append(f"- **Generated**: {ts}")
    lines.append(f"- **Fail-under median**: {fail_under}")
    lines.append("")
    header = "| Scenario | " + " | ".join(f"D{d}" for d, _ in DIM_MODULES) + " | Median | Trend |"
    sep = "|---" * (2 + len(DIM_MODULES) + 1) + "|"
    lines.append(header)
    lines.append(sep)

    failures: list[str] = []

    for sid, sc_list in scores.items():
        prior_row = prior.get(sid, {})
        cells: list[str] = [sid]
        numeric_values: list[float] = []
        trend_flag = ""
        for s in sc_list:
            has_evidence = "no evidence" not in s.rationale.lower() and "missing" not in s.rationale.lower()
            if has_evidence:
                cells.append(_fmt_score(s.score))
                numeric_values.append(s.score)
            else:
                cells.append("—")
            prev = prior_row.get(s.dim)
            if prev is not None and (prev - s.score) >= REGRESSION_THRESHOLD:
                trend_flag = "⚠️"
                failures.append(
                    f"regression: {sid} D{s.dim} {prev:.1f} → {s.score:.1f} "
                    f"(Δ {prev - s.score:.1f} ≥ {REGRESSION_THRESHOLD})"
                )
        if numeric_values:
            med = _median(numeric_values)
            cells.append(_fmt_score(med))
            if med < fail_under:
                failures.append(
                    f"median under fail-under: {sid} median {med:.1f} < {fail_under}"
                )
        else:
            cells.append("—")
        cells.append(trend_flag or "→")
        lines.append("| " + " | ".join(cells) + " |")

    lines.append("")
    lines.append("## Rationales (first miss per scenario)")
    lines.append("")
    for sid, sc_list in scores.items():
        misses = [s for s in sc_list if s.score < fail_under]
        if not misses:
            continue
        first = misses[0]
        lines.append(f"- **{sid} D{first.dim}** ({_fmt_score(first.score)}): {first.rationale} — `{first.evidence_pointer}`")
    if all("no evidence" in sc.rationale.lower() for sc_list in scores.values() for sc in sc_list):
        lines.append("")
        lines.append("_All scenarios currently score 0 (no E2E driver has produced evidence). "
                     "Baseline commit; downstream diffs will start comparing once results land in `eval/results/`._")

    return "\n".join(lines) + "\n", failures


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=REPO_ROOT / "docs" / "scoreboard.md")
    parser.add_argument("--fail-under", type=float, default=SCOREBOARD_FAIL_UNDER)
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s scoreboard %(message)s",
    )

    scenario_ids = discover_scenarios()
    if not scenario_ids:
        log.error("no scenarios found under %s", SCENARIOS_DIR)
        return 2
    log.info("scoring %d scenarios across %d dims", len(scenario_ids), len(DIM_MODULES))

    t0 = time.time()
    scores = asyncio.run(score_scenarios(scenario_ids))
    log.info("scoring done in %.1fs", time.time() - t0)

    prior_md = _load_prior_scoreboard(args.out) or ""
    prior = _parse_prior_table(prior_md)

    markdown, failures = render_markdown(scores, prior, args.fail_under)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(markdown)
    log.info("wrote %s (%d bytes)", args.out, len(markdown))

    if failures:
        for f in failures:
            log.error("%s", f)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
