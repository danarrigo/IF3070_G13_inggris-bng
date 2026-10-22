from pathlib import Path
from typing import ClassVar

import pytest
from pydantic_settings import SettingsConfigDict

from core.config import Settings


def test_default_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MONGODB_URI", raising=False)
    monkeypatch.delenv("MONGODB_DATABASE", raising=False)

    class NoEnvSettings(Settings):
        model_config: ClassVar[SettingsConfigDict] = {
            **Settings.model_config,
            "env_file": None,
        }

    settings = NoEnvSettings()

    assert settings.mongodb_uri == (
        "mongodb://devroot:devrootpassword@localhost:27017/?authSource=admin"
    )
    assert settings.mongodb_database == "ship_optimizer"


def test_env_file_and_environment_override(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "MONGODB_URI=mongodb://localhost:27018\nMONGODB_DATABASE=from_file\n",
        encoding="utf-8",
    )
    monkeypatch.delenv("MONGODB_URI", raising=False)
    monkeypatch.setenv("MONGODB_DATABASE", "from_environment")

    class FileSettings(Settings):
        model_config: ClassVar[SettingsConfigDict] = {
            **Settings.model_config,
            "env_file": env_file,
        }

    settings = FileSettings()

    assert settings.mongodb_uri == "mongodb://localhost:27018"
    assert settings.mongodb_database == "from_environment"
