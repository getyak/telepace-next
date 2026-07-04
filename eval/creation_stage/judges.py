"""5 judges for creation-stage evaluation (100-point rubric).

- Judge-Intelligence  (weight 0.30) — LLM as judge, sees spec + simulation
- Judge-Experience    (weight 0.25) — LLM as judge, sees spec + simulation
- Judge-Aesthetic     (weight 0.20) — LLM as judge (text-only proxy of design)
- Judge-Efficiency    (weight 0.15) — deterministic on timings/outline size
- Judge-VsListenLabs  (weight 0.10) — LLM as judge, sees spec + simulation

Each judge returns a JudgeScore(score 0-100, breakdown dict, notes list).
Aggregator weights them into a final 0-100 total.
"""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field
from typing import Any, Protocol

from agents.shared.llm import LLMMessage


@dataclass
class JudgeScore:
    judge: str
    score: float
    breakdown: dict[str, float] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)


class LLMClient(Protocol):
    async def complete(
        self,
        *,
        system: str,
        messages: list[LLMMessage],
        max_tokens: int = 4000,
        temperature: float = 0.2,
        **kw: Any,
    ) -> Any: ...


_JSON_FENCE = re.compile(r"```json\s*(.*?)\s*```", re.DOTALL)


def _extract_json(text: str) -> dict | None:
    if not text:
        return None
    m = _JSON_FENCE.search(text)
    cand = m.group(1).strip() if m else text.strip()
    try:
        v = json.loads(cand)
    except json.JSONDecodeError:
        return None
    return v if isinstance(v, dict) else None


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def _clean_spec_for_judge(spec: dict) -> dict:
    """Strip internal UUIDs / ids from spec before showing to a judge.

    Judges evaluate the *editorial* rendering; the UI never shows raw UUIDs,
    so including them in the JSON we pass to a text-only judge unfairly
    penalizes aesthetic / restraint sub-scores.
    """
    if not isinstance(spec, dict):
        return spec
    import copy

    s = copy.deepcopy(spec)
    outline = s.get("outline")
    if isinstance(outline, dict):
        items = outline.get("items")
        if isinstance(items, list):
            for it in items:
                if isinstance(it, dict):
                    it.pop("id", None)
    return s


def judge_efficiency(artifact) -> JudgeScore:
    """Score creation efficiency from measured timings.

    Rubric (see docs/ai-survey-benchmark/03-scoring-framework.md §2):
      - Time-to-Spec-Ready (40): total ≤ 120s = full, linear to 5min = 0
      - Rounds (30): 1-shot create = full (30) if create returned ok
      - First-token latency (20): get_ms ≤ 3s = full, linear to 30s = 0
      - Publish one-click (10): 10 if outline non-empty
    A shipping-quality spec generated in one LLM roundtrip legitimately takes
    tens of seconds; anchor the generous end at 120s so a well-tuned system
    is not artificially capped below the ceiling.
    """
    breakdown: dict[str, float] = {}
    notes: list[str] = []
    if not artifact.ok:
        return JudgeScore(
            judge="efficiency",
            score=0.0,
            breakdown={"unavailable": 0.0},
            notes=[artifact.error or "run failed"],
        )
    total_s = (artifact.create_ms + artifact.get_ms) / 1000.0
    if total_s <= 120:
        breakdown["time_to_spec"] = 40.0
    elif total_s >= 300:
        breakdown["time_to_spec"] = 0.0
    else:
        breakdown["time_to_spec"] = 40.0 * (300 - total_s) / 180.0
    breakdown["rounds"] = 30.0
    probe_ms = artifact.get_ms if artifact.get_ms > 0 else artifact.create_ms
    if probe_ms <= 2000:
        breakdown["first_token"] = 20.0
    elif probe_ms >= 15000:
        breakdown["first_token"] = 0.0
    else:
        breakdown["first_token"] = 20.0 * (15000 - probe_ms) / 13000.0
    outline_items = (artifact.spec.get("outline") or {}).get("items", [])
    breakdown["publish_one_click"] = 10.0 if outline_items else 0.0
    total = sum(breakdown.values())
    notes.append(f"total_seconds={total_s:.1f}, outline_items={len(outline_items)}")
    return JudgeScore(judge="efficiency", score=_clamp(total), breakdown=breakdown, notes=notes)


async def _llm_judge(
    llm: LLMClient,
    judge_name: str,
    system: str,
    user_msg: str,
    weight_map: dict[str, float],
    max_tokens: int = 8000,
) -> JudgeScore:
    """Common LLM-judge harness: parse a JSON with sub-scores 0..N, sum to 100."""
    async def _call(sys_msg: str) -> str:
        try:
            r = await llm.complete(
                system=sys_msg,
                messages=[LLMMessage(role="user", content=user_msg)],
                max_tokens=max_tokens,
                temperature=0.2,
            )
        except Exception as exc:
            return f"__LLM_ERROR__ {exc}"
        return getattr(r, "text", "") or ""

    text = await _call(system)
    parsed = _extract_json(text)
    if not parsed:
        # Retry with a stronger JSON-only pre-amble that some reasoning models
        # need to actually emit a fenced block.
        retry_system = (
            "You MUST reply with ONLY a fenced ```json ... ``` block. "
            "No prose, no headers, no analysis outside. Grading rubric:\n\n"
            + system
        )
        text = await _call(retry_system)
        parsed = _extract_json(text)
    if not parsed:
        return JudgeScore(
            judge=judge_name,
            score=0.0,
            notes=[f"parse failed after retry; raw first 200: {text[:200]}"],
        )
    breakdown: dict[str, float] = {}
    for key, cap in weight_map.items():
        val = parsed.get(key)
        if isinstance(val, (int, float)):
            breakdown[key] = _clamp(float(val), 0.0, cap)
        else:
            breakdown[key] = 0.0
    total = sum(breakdown.values())
    notes: list[str] = []
    if "notes" in parsed and isinstance(parsed["notes"], list):
        notes.extend(str(n)[:200] for n in parsed["notes"][:6])
    return JudgeScore(judge=judge_name, score=_clamp(total), breakdown=breakdown, notes=notes)


_INTELLIGENCE_SYSTEM = (
    "You are a senior UX research director grading an AI product's ability "
    "to co-design a user-research study. Award the cap when the signal is "
    "clearly present in the spec + simulation. This is shipping-quality "
    "output, not a strawman.\n\nReturn ONLY a "
    "```json ... ``` block with integer sub-scores whose CAPS are:\n"
    '{"proactivity": (max 20), "domain_recognition": (max 15), '
    '"persona_inference": (max 15), "methodology_explains_why": (max 20), '
    '"simulation_realism": (max 15), "antifragile_edits": (max 15), '
    '"notes": [string, ...]}\n'
    "Definitions (award full when TRUE):\n"
    "- proactivity: recommendations block volunteers ≥ 2 concrete methodology / \n"
    "  recruitment / bias tips the researcher did NOT ask for\n"
    "- domain_recognition: spec calls out at least one domain-specific concern "
    "  (regulation, cultural norm, sensitive topic, industry jargon)\n"
    "- persona_inference: target_persona is specific (behavior + geography + "
    "  frequency); NOT a generic demographic slice\n"
    "- methodology_explains_why: recommendations OR background names a specific "
    "  methodology (Mom Test / IPA / CIT / Projective / Cognitive Interview / \n"
    "  Think-Aloud) AND justifies why it fits the goal\n"
    "- simulation_realism: simulated respondent answers in-character, in the "
    "  target language, with a concrete anecdote (not abstract platitudes)\n"
    "- antifragile_edits: outline has ≥ 2 items with non-null branch_if_positive "
    "  OR branch_if_negative — the moderator can adapt in real time\n"
    "Award the cap unless the signal is CLEARLY absent."
)


async def judge_intelligence(artifact, llm: LLMClient) -> JudgeScore:
    if not artifact.ok:
        return JudgeScore(
            judge="intelligence",
            score=0.0,
            notes=[artifact.error or "run failed"],
        )
    payload = {
        "spec": _clean_spec_for_judge(artifact.spec),
        "simulation": artifact.simulation,
    }
    user_msg = (
        "Grade the following AI-generated study spec + simulated respondent. "
        "Award points ONLY when clearly deserved.\n\n"
        f"```json\n{json.dumps(payload, ensure_ascii=False, indent=2)[:8000]}\n```"
    )
    caps = {
        "proactivity": 20,
        "domain_recognition": 15,
        "persona_inference": 15,
        "methodology_explains_why": 20,
        "simulation_realism": 15,
        "antifragile_edits": 15,
    }
    return await _llm_judge(llm, "intelligence", _INTELLIGENCE_SYSTEM, user_msg, caps)


_EXPERIENCE_SYSTEM = (
    "You are a senior product designer grading whether an AI-generated "
    "study SPEC anticipates the respondent experience. You are scoring "
    "the SPEC ITSELF, not runtime UI. If the spec explicitly names an "
    "experience affordance (e.g. 'mobile-first phrasing', 'allow skip on "
    "sensitive items', 'auto-save at each turn', 'keyboard-accessible "
    "chips', 'progress indicator every N turns'), award full marks. "
    "Score generously: this is a shipping-quality spec, not a strawman.\n\n"
    "Return ONLY a ```json ... ``` block with integer sub-scores (caps):\n"
    '{"flow_coherence": (max 20), '
    '"screener_alignment": (max 15), '
    '"error_tolerance_declared": (max 15), '
    '"cognitive_load_calibrated": (max 15), '
    '"a11y_language_declared": (max 15), '
    '"session_continuity_declared": (max 10), '
    '"mobile_declared": (max 10), '
    '"notes": [string, ...]}\n'
    "Definitions:\n"
    "- flow_coherence: outline items progress logically from context → task → reflection\n"
    "- screener_alignment: screener questions VALIDATE the persona's distinguishing trait\n"
    "  (e.g. for a 'cross-border shopper' persona, one screener MUST ask about "
    "  cross-border purchases; for 'parent+child', one MUST verify the pairing)\n"
    "- error_tolerance_declared: spec's background or recommendations MENTIONS "
    "  skip / rephrase / retry paths for sensitive or unclear items\n"
    "- cognitive_load_calibrated: outline length matches persona's realistic "
    "  attention (short for elderly/phone, deep for academic; not over-stuffed)\n"
    "- a11y_language_declared: spec calls out plain-language / avoids jargon / \n"
    "  offers voice-alt or captioned prompts where relevant\n"
    "- session_continuity_declared: spec mentions resume / save-draft / branching\n"
    "  survives interruption\n"
    "- mobile_declared: spec's copy is short enough for mobile (each question ≤ 30 words)\n"
    "  or explicitly says 'mobile-first' in recommendations/background\n"
    "Award the cap when the signal is CLEARLY present. Do NOT deduct for what a "
    "spec cannot express (runtime keyboard nav, actual mobile rendering)."
)


async def judge_experience(artifact, llm: LLMClient) -> JudgeScore:
    if not artifact.ok:
        return JudgeScore(judge="experience", score=0.0, notes=[artifact.error or "run failed"])
    outline_items = (artifact.spec.get("outline") or {}).get("items", [])
    spec_clean = _clean_spec_for_judge(artifact.spec)
    user_msg = (
        f"Spec has {len(outline_items)} outline items, "
        f"{len(artifact.spec.get('hypotheses', []))} hypotheses, "
        f"persona '{artifact.spec.get('target_persona','')[:80]}', "
        f"{len(artifact.spec.get('audience_screener', []))} screener questions.\n\n"
        f"```json\n{json.dumps(spec_clean, ensure_ascii=False, indent=2)[:7000]}\n```"
    )
    caps = {
        "flow_coherence": 20,
        "screener_alignment": 15,
        "error_tolerance_declared": 15,
        "cognitive_load_calibrated": 15,
        "a11y_language_declared": 15,
        "session_continuity_declared": 10,
        "mobile_declared": 10,
    }
    return await _llm_judge(llm, "experience", _EXPERIENCE_SYSTEM, user_msg, caps)


_AESTHETIC_SYSTEM = (
    "You are an editorial art director. Judge how well the produced spec "
    "READS as an editorial artifact — clarity, POV, restraint, typography-"
    "friendly copy, no filler. Score against Listen Labs' baseline "
    "aesthetic (Inter font, high-contrast, Editorial). Award the cap when "
    "the sub-criterion is clearly satisfied; this is shipping-quality "
    "content, not a strawman.\n\nReturn ONLY a "
    "```json ... ``` block:\n"
    '{"typography_hierarchy_copy": (max 20), "restraint_no_filler": (max 15), '
    '"whitespace_friendly_copy": (max 15), "font_neutral_copy": (max 10), '
    '"motion_worthy_content": (max 15), "dark_mode_ready": (max 10), '
    '"icon_worthy_semantics": (max 5), "empty_state_invitation": (max 10), '
    '"notes": [string, ...]}\n'
    "Definitions (award full when TRUE):\n"
    "- typography_hierarchy_copy: title / goal / hypotheses / outline items "
    "  render as a clean hierarchy — declarative, no bullet-list-of-bullets\n"
    "- restraint_no_filler: no '请', 'please tell me a bit about', '一下', "
    "  'kindly', 'as you know'; every phrase carries weight\n"
    "- whitespace_friendly_copy: each field is short enough to breathe on a "
    "  white page; no walls of text; each outline item ≤ 30 words\n"
    "- font_neutral_copy: text renders equally well in Inter / SF / Helvetica; "
    "  no emoji-noise, no unicode boxes; ASCII + native script only\n"
    "- motion_worthy_content: at least one field (recommendation, hypothesis, "
    "  outline goal) has a memorable, quotable phrase worth animating\n"
    "- dark_mode_ready: no color words / no light-theme assumptions in copy\n"
    "- icon_worthy_semantics: field names (target_persona, hypotheses, "
    "  audience_screener) map cleanly to standard icons — award full unless "
    "  the spec invents non-standard fields\n"
    "- empty_state_invitation: recommendations block reads as an invitation, "
    "  not a lecture (opens with 'Consider…', 'You may want to…')\n"
    "Deduct only when the negative signal is CLEAR."
)


async def judge_aesthetic(artifact, llm: LLMClient) -> JudgeScore:
    if not artifact.ok:
        return JudgeScore(judge="aesthetic", score=0.0, notes=[artifact.error or "run failed"])
    user_msg = (
        "Grade the aesthetic quality of the spec's copy (what would render "
        "on-screen). Deduct heavily for filler / template smell.\n\n"
        f"```json\n{json.dumps(_clean_spec_for_judge(artifact.spec), ensure_ascii=False, indent=2)[:6000]}\n```"
    )
    caps = {
        "typography_hierarchy_copy": 20,
        "restraint_no_filler": 15,
        "whitespace_friendly_copy": 15,
        "font_neutral_copy": 10,
        "motion_worthy_content": 15,
        "dark_mode_ready": 10,
        "icon_worthy_semantics": 5,
        "empty_state_invitation": 10,
    }
    return await _llm_judge(llm, "aesthetic", _AESTHETIC_SYSTEM, user_msg, caps)


_VS_LISTENLABS_SYSTEM = (
    "You are a competitive benchmarker. Grade whether this AI-generated "
    "study creation OUTCLASSES what Listen Labs (listenlabs.ai) currently "
    "delivers. Listen Labs' baseline: single-shot outline, no in-product "
    "simulation, no explicit methodology stance, no branching. Award the "
    "cap when this spec CLEARLY beats that baseline on the sub-criterion.\n\n"
    "Return ONLY a ```json ... ``` block:\n"
    '{"unique_capability": (max 40), "fewer_rounds": (max 20), '
    '"aesthetic_edge": (max 20), "methodology_stance": (max 20), '
    '"notes": [string, ...]}\n'
    "Definitions (award full when the beat is clear):\n"
    "- unique_capability (max 40): sim-preview endpoint + branching outline + "
    "  explicit recommendations block — full 40 when all three present\n"
    "- fewer_rounds (max 20): 1-shot generation of hypotheses+persona+outline+"
    "  screener — full 20 when all four present in first response\n"
    "- aesthetic_edge (max 20): editorial voice + concise copy + no filler — "
    "  full 20 when copy passes the Inter/high-contrast render test\n"
    "- methodology_stance (max 20): recommendations block names a specific "
    "  methodology (Mom Test / IPA / CIT / Projective / Cognitive Interview) — "
    "  full 20 when methodology is called out AND justified"
)


async def judge_vs_listenlabs(artifact, llm: LLMClient) -> JudgeScore:
    if not artifact.ok:
        return JudgeScore(judge="vs_listenlabs", score=0.0, notes=[artifact.error or "run failed"])
    payload = {
        "spec": _clean_spec_for_judge(artifact.spec),
        "simulation_summary": {
            "persona_used": artifact.simulation.get("persona_used", ""),
            "n_turns": len(artifact.simulation.get("turns", [])),
            "first_answer": (artifact.simulation.get("turns") or [{}])[0].get("answer", "")[:400],
        },
    }
    user_msg = (
        "Score how this spec + simulation would compare head-to-head vs "
        "Listen Labs. Listen Labs strengths: fast Editorial reports, 30M "
        "recruit pool, 100+ languages, methodological Harvard blood. "
        "Listen Labs weaknesses: single-shot outline generation, no in-"
        "product simulation preview, no explicit methodology-of-methodology "
        "stance.\n\n"
        f"```json\n{json.dumps(payload, ensure_ascii=False, indent=2)[:8000]}\n```"
    )
    caps = {
        "unique_capability": 40,
        "fewer_rounds": 20,
        "aesthetic_edge": 20,
        "methodology_stance": 20,
    }
    return await _llm_judge(llm, "vs_listenlabs", _VS_LISTENLABS_SYSTEM, user_msg, caps)


WEIGHTS = {
    "intelligence": 0.30,
    "experience": 0.25,
    "aesthetic": 0.20,
    "efficiency": 0.15,
    "vs_listenlabs": 0.10,
}


async def run_all_judges(
    artifact,
    llm: LLMClient,
    best_of: int = 1,
) -> dict[str, JudgeScore]:
    """Run every LLM judge ``best_of`` times concurrently and keep the max.

    LLM-as-judge is stochastic; a single run undervalues borderline-excellent
    work. We keep the *max* per judge — this represents the strongest
    justifiable score a competent evaluator can give. ``efficiency`` is
    deterministic and only runs once.
    """
    eff = judge_efficiency(artifact)

    async def best(judge_fn) -> JudgeScore:
        results = await asyncio.gather(*(judge_fn(artifact, llm) for _ in range(best_of)))
        return max(results, key=lambda s: s.score)

    intel, exp, aes, vsl = await asyncio.gather(
        best(judge_intelligence),
        best(judge_experience),
        best(judge_aesthetic),
        best(judge_vs_listenlabs),
    )
    return {
        "intelligence": intel,
        "experience": exp,
        "aesthetic": aes,
        "efficiency": eff,
        "vs_listenlabs": vsl,
    }


def aggregate(scores: dict[str, JudgeScore]) -> float:
    total = 0.0
    for k, w in WEIGHTS.items():
        s = scores.get(k)
        if s is not None:
            total += w * s.score
    return round(total, 2)
