import hashlib
import json

from dtos.run import CreateRunRequest
from models.config import ConfigModel
from models.run import RunModel


def hash_config(config: ConfigModel) -> str:
    data = config.model_dump(mode="json")
    json_string = json.dumps(data, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(json_string.encode("utf-8")).hexdigest()


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

