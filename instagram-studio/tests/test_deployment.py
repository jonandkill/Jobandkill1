import os
from pathlib import Path
import pytest
from start import configure_host


def test_render_url_resolved_before_app_import(monkeypatch):
    monkeypatch.setenv('RENDER', 'true')
    monkeypatch.delenv('PUBLIC_BASE_URL', raising=False)
    monkeypatch.setenv('RENDER_EXTERNAL_URL', 'https://studio.example/')
    monkeypatch.setenv('REQUIRE_PERSISTENT_DATA', 'false')
    configure_host()
    assert os.environ['PUBLIC_BASE_URL'] == 'https://studio.example'


def test_render_refuses_insecure_callback_base(monkeypatch):
    monkeypatch.setenv('RENDER', 'true')
    monkeypatch.setenv('PUBLIC_BASE_URL', 'http://studio.example')
    with pytest.raises(RuntimeError, match='HTTPS'):
        configure_host()


def test_production_refuses_ephemeral_storage(monkeypatch, tmp_path):
    monkeypatch.setenv('RENDER', 'true')
    monkeypatch.setenv('PUBLIC_BASE_URL', 'https://studio.example')
    monkeypatch.setenv('DATA_DIR', str(tmp_path))
    monkeypatch.setenv('REQUIRE_PERSISTENT_DATA', 'true')
    assert not tmp_path.is_mount()
    with pytest.raises(RuntimeError, match='영구 디스크'):
        configure_host()
