"""DispatchHandler i18n template selection unit tests (no LLM involved)."""

from __future__ import annotations

from core.domain.models import ChannelKind
from core.protocols.commands import InviteInput
from harness.handlers.dispatch_handler import (
    _build_email_content,
    _build_opening_line,
    _build_sms_body,
    _resolve_language,
)


def _invite(name: str | None = None) -> InviteInput:
    return InviteInput(address="a@b.com", channel=ChannelKind.EMAIL, name=name)


def test_resolve_language_known_codes() -> None:
    assert _resolve_language("zh") == "zh"
    assert _resolve_language("en") == "en"


def test_resolve_language_region_variant_maps_to_primary_subtag() -> None:
    assert _resolve_language("zh-CN") == "zh"
    assert _resolve_language("zh-TW") == "zh"


def test_resolve_language_unknown_falls_back_to_en() -> None:
    assert _resolve_language("fr") == "en"
    assert _resolve_language("") == "en"


def test_zh_templates_selected_for_zh_language() -> None:
    subject, html, text = _build_email_content(
        _invite("张三"), "定价调研", "了解定价敏感度", "https://x/r/1", 10, "zh"
    )
    assert "邀请您参与" in subject
    assert "张三，你好" in text
    assert "分钟" in text
    assert "分钟" in html

    sms = _build_sms_body(_invite(), "定价调研", "https://x/r/1", 10, "zh")
    assert "分钟" in sms

    opening = _build_opening_line(_invite("张三"), "定价调研", "zh")
    assert "您好张三" in opening


def test_en_templates_selected_for_en_language() -> None:
    subject, _, text = _build_email_content(
        _invite("Alice"), "Pricing study", "understand sensitivity", "https://x/r/1", 10, "en"
    )
    assert "You're invited" in subject
    assert "Hi Alice" in text

    opening = _build_opening_line(_invite("Alice"), "Pricing study", "en")
    assert "Hi Alice" in opening


def test_unknown_language_falls_back_to_en_templates() -> None:
    subject_fr, _, _ = _build_email_content(
        _invite(), "Pricing study", "x", "https://x/r/1", 10, "fr"
    )
    subject_en, _, _ = _build_email_content(
        _invite(), "Pricing study", "x", "https://x/r/1", 10, "en"
    )
    assert subject_fr == subject_en
