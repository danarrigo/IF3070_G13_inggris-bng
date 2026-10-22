from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, model_validator

from models.config import ConfigModel
from models.run import (
    GeneticAlgorithmSettings,
    PopulationPoint,
    RunModel,
    VehiclePlacement,
)


class StartJobRequest(BaseModel):
    config: ConfigModel
    settings: GeneticAlgorithmSettings
    random_seed: int
    record_demo: bool = False

    @model_validator(mode="after")
    def check_demo_size(self):
        if self.record_demo and (
            self.settings.population_size > 10
            or self.settings.iterations > 10
            or len(self.config.vehicles) > 30
        ):
            raise ValueError(
                "Demo recording supports at most 10 individuals, 10 generations, and 30 vehicles."
            )
        return self


class JobState(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    status: Literal["queued", "running", "completed", "failed", "cancelled"] = "queued"
    stage: Literal[
        "queued",
        "initializing",
        "searching",
        "cancelling",
        "saving",
        "completed",
        "failed",
        "cancelled",
    ] = "queued"
    request: StartJobRequest
    generation: int = 0
    elapsed_ms: float = 0
    initial_arrangement: list[VehiclePlacement] | None = None
    population_history: list[PopulationPoint] = Field(default_factory=list)
    run: RunModel | None = None
    error: str | None = None
