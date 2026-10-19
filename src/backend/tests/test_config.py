from core.config import Settings


def test_default_settings(monkeypatch):
    monkeypatch.delenv("MONGODB_URI", raising=False)
    monkeypatch.delenv("MONGODB_DATABASE", raising=False)

    settings = Settings(_env_file=None)

    assert settings.mongodb_uri == (
        "mongodb://devroot:devrootpassword@localhost:27017/?authSource=admin"
    )
    assert settings.mongodb_database == "ship_optimizer"


def test_env_file_and_environment_override(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "MONGODB_URI=mongodb://localhost:27018\n"
        "MONGODB_DATABASE=from_file\n",
        encoding="utf-8",
    )
    monkeypatch.delenv("MONGODB_URI", raising=False)
    monkeypatch.setenv("MONGODB_DATABASE", "from_environment")

    settings = Settings(_env_file=env_file)

    assert settings.mongodb_uri == "mongodb://localhost:27018"
    assert settings.mongodb_database == "from_environment"
