from __future__ import annotations

import pathlib


def test_streamlit_entrypoint_exists() -> None:
    assert pathlib.Path("app/document_arena/Home.py").exists()


def test_dockerfile_exposes_streamlit_port() -> None:
    dockerfile = pathlib.Path("app/Dockerfile").read_text(encoding="utf-8")
    assert "EXPOSE 8501" in dockerfile
    assert "streamlit" in dockerfile


def test_public_model_default_is_nova_profile() -> None:
    config = pathlib.Path("lib/config.ts").read_text(encoding="utf-8")
    assert "us.amazon.nova-2-lite-v1:0" in config
