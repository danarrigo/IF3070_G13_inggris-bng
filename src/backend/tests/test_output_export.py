import json
from threading import Event
from unittest.mock import MagicMock
from xml.etree import ElementTree

import pytest

from dtos.optimization import HillClimbingRequest
from dtos.run import AnnealingRequest
from models.config import ConfigModel, Ship, Vehicle
from models.job import StartJobRequest
from models.run import GeneticAlgorithmSettings, SimulatedAnnealingSettings
from services import output_service
from services.job_service import JobManager
from services.optimization_service import execute_hill_climbing
from services.output_service import OutputExportError, export_run
from services.search_service import execute_saved_runs


def execute(algorithm, config, db, enabled, monkeypatch):
    if algorithm == "hill_climbing":
        return execute_hill_climbing(
            db, HillClimbingRequest(config=config, iterations=2, save_to_output=enabled)
        )
    if algorithm == "simulated_annealing":
        return execute_saved_runs(
            db,
            AnnealingRequest(
                config=config,
                settings=SimulatedAnnealingSettings(
                    algorithm=algorithm,
                    iterations=2,
                    initial_temperature=10,
                    cooling_rate=0.9,
                ),
                run_count=3,
                save_to_output=enabled,
            ),
        )[0]
    manager = JobManager()
    finished = Event()
    original = manager._execute

    def work(*args):
        try:
            original(*args)
        finally:
            finished.set()

    monkeypatch.setattr(manager, "_execute", work)
    job = manager.start(
        StartJobRequest(
            config=config,
            random_seed=42,
            save_to_output=enabled,
            settings=GeneticAlgorithmSettings(
                algorithm=algorithm,
                population_size=2,
                iterations=2,
                crossover_rate=0.8,
                mutation_rate=0.3,
            ),
        ),
        db,
    )
    assert finished.wait(5)
    state = manager.get(job.id)
    assert state.status == "completed", state.error
    return state.run


@pytest.mark.parametrize(
    "algorithm", ["hill_climbing", "simulated_annealing", "genetic_algorithm"]
)
@pytest.mark.parametrize("mode", ["shipping_fee", "eta_priority"])
@pytest.mark.parametrize("enabled", [False, True])
def test_completed_runs_export_only_when_selected(
    algorithm, mode, enabled, tmp_path, monkeypatch
):
    root = tmp_path / "output"
    monkeypatch.setattr(output_service, "OUTPUT_ROOT", root)
    config = ConfigModel(
        ship=Ship(length=2, width=2, max_weight=1),
        objective_mode=mode,
        vehicles=[
            Vehicle(length=1, width=1, weight=1, eta=0, shipping_fee=10),
            Vehicle(length=1, width=1, weight=1, eta=5, shipping_fee=40),
        ],
    )
    db = MagicMock()
    run = execute(algorithm, config, db, enabled, monkeypatch)
    assert db["runs"].insert_one.call_count == (
        3 if algorithm == "simulated_annealing" else 1
    )
    if not enabled:
        assert not root.exists()
        return
    paths = list((root / algorithm).iterdir())
    assert len(paths) == (3 if algorithm == "simulated_annealing" else 1)
    folder = root / algorithm / str(run.id)
    expected = {"summary.json", "run.json", "initial.svg", "final.svg", "objective.svg"}
    if algorithm == "simulated_annealing":
        expected.add("exponential.svg")
    assert {file.name for file in folder.iterdir()} == expected
    saved = json.loads((folder / "run.json").read_text())
    summary = json.loads((folder / "summary.json").read_text())
    assert saved == run.model_dump(mode="json")
    assert summary["metrics"]["final_objective"] == run.result.final_objective
    assert summary["metrics"]["runtime_ms"] == run.result.runtime_ms
    assert summary["settings"] == saved["settings"]
    assert summary["objective_mode"] == mode
    for svg in folder.glob("*.svg"):
        document = ElementTree.fromstring(svg.read_text())
        assert document.tag == "{http://www.w3.org/2000/svg}svg"
        assert "nan" not in svg.read_text().lower()
    assert "Outside ship:" in (folder / "final.svg").read_text()
    assert ("ETA priority points" if mode == "eta_priority" else "million IDR") in (
        folder / "objective.svg"
    ).read_text()
    if algorithm == "genetic_algorithm":
        assert "Maximum" in (folder / "objective.svg").read_text()
        assert "Average" in (folder / "objective.svg").read_text()
    if algorithm == "simulated_annealing":
        assert "stuck_count" in summary["metrics"]
        assert "Stagnation-window" in summary["stuck_definition"]


def test_export_failure_does_not_leave_partial_run_folder(tmp_path, monkeypatch):
    config = ConfigModel(ship=Ship(length=1, width=1, max_weight=1), vehicles=[])
    run = execute_hill_climbing(
        MagicMock(), HillClimbingRequest(config=config, iterations=1)
    )

    def fail(*args, **kwargs):
        raise PermissionError("read-only")

    monkeypatch.setattr(output_service, "_arrangement", fail)
    with pytest.raises(OutputExportError):
        export_run(run, tmp_path)
    assert list((tmp_path / "hill_climbing").iterdir()) == []
