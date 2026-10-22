import hashlib
import json
from collections.abc import Callable
from dataclasses import dataclass
from random import Random

from pymongo.database import Database

from algorithms.cancellation import check_cancellation
from algorithms.initialization import initialize_arrangement
from algorithms.objective import calculate_objective
from dtos.run import CreateRunRequest
from models.config import ConfigModel
from models.run import RunModel, VehiclePlacement
from services.config_service import load_config


def hash_config(config: ConfigModel) -> str:
    data = config.model_dump(mode="json")
    json_string = json.dumps(data, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(json_string.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class PreparedRun:
    config: ConfigModel
    config_hash: str
    random_seed: int
    initial_arrangement: list[VehiclePlacement]
    initial_objective: int
    rng: Random


def prepare_run(
    db: Database[dict[str, object]],
    *,
    random_seed: int,
    preserve_positions: bool | None = None,
) -> PreparedRun:
    """Load, validate and initialize a run. Does not execute or persist a result.

    Continue with the returned RNG so initialization and search share one seeded
    random stream. The config snapshot/hash retain the original user inputs;
    actual randomized starting placements are in initial_arrangement. Assignment
    experiments use the config's start-mode toggle (random by default). An explicit
    preserve_positions argument overrides that saved setting.
    """
    return prepare_config(
        load_config(db), random_seed=random_seed, preserve_positions=preserve_positions
    )


def prepare_config(
    config: ConfigModel,
    *,
    random_seed: int,
    preserve_positions: bool | None = None,
    should_cancel: Callable[[], bool] | None = None,
) -> PreparedRun:
    check_cancellation(should_cancel)
    config = config.model_copy(deep=True)
    rng = Random(random_seed)
    placements = initialize_arrangement(
        config,
        rng,
        preserve_positions=preserve_positions,
        should_cancel=should_cancel,
    )
    return PreparedRun(
        config=config,
        config_hash=hash_config(config),
        random_seed=random_seed,
        initial_arrangement=placements,
        initial_objective=calculate_objective(config, placements),
        rng=rng,
    )


def build_run(request: CreateRunRequest) -> RunModel:
    config_hash = hash_config(request.config)
    run = RunModel(
        random_seed=request.random_seed,
        configHash=config_hash,
        config=request.config,
        settings=request.settings,
        result=request.result,
    )
    return run
