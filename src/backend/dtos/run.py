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
