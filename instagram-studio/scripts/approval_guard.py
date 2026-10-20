"""Local owner approval receipt checks. This module never opens a network connection.

The receipt is an operational acknowledgement, not proof of a human identity.
Keep it outside version control and obtain explicit owner approval before creating it.
"""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


def _time(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('승인 시각에는 시간대가 필요합니다.')
    return parsed.astimezone(timezone.utc)


def require_submission_approval(payload, content_id, base_url, approval_path, now=None):
    if not approval_path:
        raise ValueError('사용자의 해당 파일 업로드·예약 승인이 필요합니다. --approval 승인파일을 확인하세요.')
    receipt = json.loads(Path(approval_path).read_text(encoding='utf-8-sig'))
    instant = now or datetime.now(timezone.utc)
    if receipt.get('approved') is not True or receipt.get('scope') != 'studio_upload_and_schedule':
        raise ValueError('업로드와 자동 예약을 명시적으로 승인한 기록이 아닙니다.')
    if not str(receipt.get('approved_by', '')).strip():
        raise ValueError('승인자 기록이 없습니다.')
    if receipt.get('content_id') != content_id or receipt.get('bundle_sha256') != hashlib.sha256(payload).hexdigest():
        raise ValueError('승인한 회차 또는 최종 ZIP이 현재 파일과 다릅니다.')
    if receipt.get('studio_base_url') != base_url.rstrip('/'):
        raise ValueError('승인한 업로드 서버와 현재 서버가 다릅니다.')
    try:
        created = _time(receipt['approved_at_utc'])
        expires = _time(receipt['expires_at_utc'])
        if not created <= instant < expires:
            raise ValueError('승인 기한이 아니거나 만료되었습니다.')
        if (expires-created).total_seconds() > 86400:
            raise ValueError('승인 유효기간은 24시간 이하여야 합니다.')
    except (KeyError, TypeError) as exc:
        raise ValueError('승인 시각을 확인하세요.') from exc
    return receipt

