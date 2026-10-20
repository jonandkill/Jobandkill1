#!/usr/bin/env python3
"""Validate compact JOB&KILL carousel copy without rendering or publishing."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path


class CopyGateError(ValueError):
    pass


SLIDE_BUDGETS = {1: 28, 2: 72, 3: 60, 4: 80, 5: 86, 6: 72}
SLIDE_LINE_LIMITS = {1: 2, 2: 5, 3: 4, 4: 6, 5: 5, 6: 4}
CTA = "취업·면접 준비가 더 필요하면 잡앤킬을 팔로우하세요."
DISCLAIMER_FRAGMENTS = ("가상 사례", "연출 사진", "이해를 돕기 위한")


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def visible_lines(slide: dict) -> list[str]:
    lines: list[str] = []
    for key in ("headline", "body"):
        value = slide.get(key, "")
        if not isinstance(value, str):
            raise CopyGateError(f"slide {slide.get('slide')}: {key} must be text")
        lines.extend(value.splitlines() if value else [])
    steps = slide.get("steps", [])
    if steps:
        if not isinstance(steps, list) or any(not isinstance(x, str) for x in steps):
            raise CopyGateError(f"slide {slide.get('slide')}: steps must be text list")
        lines.extend(steps)
    for key in ("action", "cta"):
        value = slide.get(key, "")
        if value:
            if not isinstance(value, str):
                raise CopyGateError(f"slide {slide.get('slide')}: {key} must be text")
            lines.extend(value.splitlines())
    return [line.strip() for line in lines if line.strip()]


def visible_chars(slide: dict) -> int:
    return sum(1 for ch in "".join(visible_lines(slide)) if not ch.isspace())


def validate(data: dict) -> dict:
    errors: list[str] = []
    items = data.get("items")
    if not isinstance(items, list) or not 1 <= len(items) <= 10:
        return {"status": "INVALID", "errors": ["items must contain 1..10 topics"], "publication_approved": False}
    if data.get("publication_approved") is not False:
        errors.append("publication_approved must remain false")
    seen: set[str] = set()
    metrics: list[dict] = []
    for item in items:
        ident = item.get("id")
        if not isinstance(ident, str) or not ident:
            errors.append("topic id missing")
            continue
        if ident in seen:
            errors.append(f"{ident}: duplicate id")
        seen.add(ident)
        question = item.get("original_question")
        if not isinstance(question, str) or not question:
            errors.append(f"{ident}: original question missing")
        elif item.get("original_question_sha256") != sha256_text(question):
            errors.append(f"{ident}: original question hash mismatch")
        slides = item.get("slides")
        if not isinstance(slides, list) or [s.get("slide") for s in slides if isinstance(s, dict)] != [1, 2, 3, 4, 5, 6]:
            errors.append(f"{ident}: six ordered slides required")
            continue
        item_metrics = {"id": ident, "slides": []}
        for slide in slides:
            number = slide["slide"]
            try:
                lines = visible_lines(slide)
                chars = visible_chars(slide)
            except CopyGateError as exc:
                errors.append(f"{ident}: {exc}")
                continue
            if chars > SLIDE_BUDGETS[number]:
                errors.append(f"{ident}: slide {number} has {chars}>{SLIDE_BUDGETS[number]} visible characters")
            if len(lines) > SLIDE_LINE_LIMITS[number]:
                errors.append(f"{ident}: slide {number} has {len(lines)}>{SLIDE_LINE_LIMITS[number]} authored lines")
            if number == 4 and len(slide.get("steps", [])) != 4:
                errors.append(f"{ident}: slide 4 requires exactly four short steps")
            if number == 6 and slide.get("cta") != CTA:
                errors.append(f"{ident}: slide 6 CTA mismatch")
            joined = " ".join(lines)
            if any(fragment in joined for fragment in DISCLAIMER_FRAGMENTS):
                errors.append(f"{ident}: slide {number} repeats a disclosure; keep it in the caption metadata")
            item_metrics["slides"].append({"slide": number, "visible_characters": chars, "authored_lines": len(lines)})
        metrics.append(item_metrics)
    return {
        "status": "TEXT_DENSITY_VALID_PUBLICATION_UNAPPROVED" if not errors else "INVALID",
        "errors": errors,
        "items": len(items),
        "budgets": SLIDE_BUDGETS,
        "metrics": metrics,
        "publication_approved": False,
        "note": "This is an editorial density gate, not rendered mobile readability, OCR, image, account, upload, schedule, or publication approval.",
    }


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: carousel_copy_guard.py COMPACT_BATCH.json", file=sys.stderr)
        return 2
    data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    result = validate(data)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "TEXT_DENSITY_VALID_PUBLICATION_UNAPPROVED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
