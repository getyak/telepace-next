"""Real read-side adapters for the insight/followup MCP tools.

`get_campaign_insights` and `ask_followup` both take a pluggable service so the
MCP entrypoint can wire either a stub (early bring-up) or these projector- and
analyst-backed implementations. They read from the same durable projection the
REST `/insights` endpoint serves, so the two surfaces never diverge.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from agents.analyst.main import TranscriptView
from core.events import InterviewCompleted, TurnRecorded

# The insight `kind` values the projector persists (see AnalystAgent) vs. the
# coarse `format` a caller asks for. "report" and "themes" both surface themes;
# "verbatims" surfaces quotes; "persona" surfaces the persona insight.
_FORMAT_TO_KINDS: dict[str, tuple[str, ...]] = {
    "themes": ("theme",),
    "report": ("theme", "concern"),
    "verbatims": ("verbatim",),
    "persona": ("persona",),
}


class ProjectorInsightReader:
    """Reads persisted insights from the campaign projection.

    Maps the projector's row shape onto the MCP `InsightItem` contract. The
    `supporting_interview_ids` list lives inside each insight's `body` (the
    Analyst writes it there); we surface it as a first-class field and tolerate
    its absence on older rows.
    """

    def __init__(self, projector: Any) -> None:
        self._projector = projector

    async def list_insights(
        self,
        *,
        campaign_id: UUID,
        format: str = "themes",  # noqa: A002 — matches the MCP tool contract field name
        min_confidence: float = 0.5,
    ) -> list[dict[str, Any]]:
        rows = await self._projector.list_insights(campaign_id)
        kinds = _FORMAT_TO_KINDS.get(format, ("theme",))
        items: list[dict[str, Any]] = []
        for row in rows:
            if row["kind"] not in kinds:
                continue
            if float(row.get("confidence", 0.0)) < min_confidence:
                continue
            body = row.get("body") or {}
            raw_ids = body.get("supporting_interview_ids", []) if isinstance(body, dict) else []
            supporting = [str(i) for i in raw_ids] if isinstance(raw_ids, list) else []
            items.append(
                {
                    "id": row["id"],
                    "kind": row["kind"],
                    "title": row["title"],
                    "body": _stringify_body(body),
                    "confidence": float(row.get("confidence", 0.0)),
                    "supporting_interview_ids": supporting,
                }
            )
        return items


class EventStoreTranscriptReader:
    """Rebuilds interview transcripts from the durable event stream.

    Mirrors the reconstruction the analysis worker already performs
    (worker.analyze_completion): read a campaign's stream, group TurnRecorded
    events by interview_id. `scope="completed_only"` restricts to interviews
    that reached InterviewCompleted; "all" includes in-flight ones too.
    """

    def __init__(self, event_store: Any) -> None:
        self._event_store = event_store

    async def list_transcripts(
        self, *, campaign_id: UUID, scope: str = "completed_only"
    ) -> list[TranscriptView]:
        stored = await self._event_store.read_stream(campaign_id)
        by_interview: dict[UUID, list[dict[str, str]]] = {}
        completed: set[UUID] = set()
        for se in stored:
            e = se.event
            if isinstance(e, TurnRecorded):
                iid = getattr(e, "interview_id", None)
                if iid is not None:
                    by_interview.setdefault(iid, []).append({"role": e.role, "text": e.text})
            elif isinstance(e, InterviewCompleted):
                iid = getattr(e, "interview_id", None)
                if iid is not None:
                    completed.add(iid)

        views: list[TranscriptView] = []
        for iid, turns in by_interview.items():
            if scope == "completed_only" and iid not in completed:
                continue
            views.append(TranscriptView(interview_id=iid, turns=turns))
        return views


class AnalystFollowupService:
    """Answers a natural-language question over a campaign's transcripts.

    Reuses the AnalystAgent's synthesis: the distilled themes become the
    grounded evidence for the answer. When no transcripts exist yet the answer
    is an honest "not enough evidence" rather than a hallucination — the same
    failure mode the REST insights path already surfaces.
    """

    def __init__(self, analyst: Any, transcript_reader: EventStoreTranscriptReader) -> None:
        self._analyst = analyst
        self._transcript_reader = transcript_reader

    async def answer(
        self,
        *,
        campaign_id: UUID,
        question: str,
        scope: str = "completed_only",
    ) -> dict[str, Any]:
        transcripts = await self._transcript_reader.list_transcripts(
            campaign_id=campaign_id, scope=scope
        )
        if not transcripts:
            return {
                "answer": "There isn't enough collected evidence to answer that yet.",
                "evidence": [],
            }
        result = await self._analyst.synthesize(
            campaign_id=campaign_id,
            transcripts=transcripts,
        )
        # Ground the answer in the synthesized themes; each theme's label +
        # supporting interview ids form one evidence row.
        evidence: list[dict[str, str]] = []
        answer_parts: list[str] = []
        for th in result.themes[:5]:
            label = str(th.get("label", "")).strip()
            if label:
                answer_parts.append(label)
                evidence.append(
                    {
                        "quote": label,
                        "interview_ids": ",".join(
                            str(i) for i in th.get("supporting_interview_ids", []) or []
                        ),
                    }
                )
        answer = (
            "; ".join(answer_parts)
            if answer_parts
            else "No clear themes emerged from the transcripts for that question."
        )
        return {"answer": answer, "evidence": evidence}


def _stringify_body(body: Any) -> str:
    """The InsightItem contract wants `body: str`. Themes/concerns store a dict;
    prefer a human-readable field, else fall back to an empty string."""
    if isinstance(body, str):
        return body
    if isinstance(body, dict):
        for key in ("body", "summary", "quote", "description", "label"):
            val = body.get(key)
            if isinstance(val, str) and val:
                return val
    return ""
