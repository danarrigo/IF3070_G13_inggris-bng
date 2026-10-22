from typing import Literal

from pydantic import BaseModel, Field

from models.config import ConfigModel
from models.run import (
    GeneticAlgorithmSettings,
    HillClimbingSettings,
    RunResult,
    SimulatedAnnealingSettings,
)


class CreateRunRequest(BaseModel):
    config: ConfigModel
    random_seed: int
    settings: (
        HillClimbingSettings | SimulatedAnnealingSettings | GeneticAlgorithmSettings
    ) = Field(discriminator="algorithm")
    result: RunResult


class AnnealingRequest(BaseModel):
    config: ConfigModel
    settings: SimulatedAnnealingSettings
    random_seed: int = Field(default=42, ge=0, le=2**32 - 4)
    run_count: Literal[1, 3] = 1
