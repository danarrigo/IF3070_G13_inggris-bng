from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

from models.config import ConfigModel

type HillClimbingVariant = Literal[
    "steepest_ascent", "stochastic", "sideways", "random_restart"
]
type HillClimbingStopReason = Literal[
    "local_optimum", "iteration_limit", "sideways_limit", "restart_limit"
]


class HillClimbingSettings(BaseModel):
    algorithm: Literal["hill_climbing"]
    iterations: int = Field(gt=0)
    variant: HillClimbingVariant = "steepest_ascent"
    max_sideways: int = Field(default=100, ge=0, le=10000)
    max_restart: int = Field(default=10, ge=0, le=1000)


class SimulatedAnnealingSettings(BaseModel):
    algorithm: Literal["simulated_annealing"]
    iterations: int = Field(gt=0)
    initial_temperature: float = Field(gt=0)
    cooling_rate: float = Field(gt=0, lt=1)


class GeneticAlgorithmSettings(BaseModel):
    algorithm: Literal["genetic_algorithm"]
    iterations: int = Field(gt=0)
    population_size: int = Field(gt=1)
    crossover_rate: float = Field(ge=0, le=1)
    mutation_rate: float = Field(ge=0, le=1)


class VehiclePlacement(BaseModel):
    vehicle_id: UUID
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    length: int = Field(gt=0)
    width: int = Field(gt=0)


class ObjectivePoint(BaseModel):
    iteration: int = Field(ge=0)
    objective: int = Field(ge=0)


class RunResult(BaseModel):
    final_arrangement: list[VehiclePlacement]
    unloaded_vehicle_ids: list[UUID]
    initial_objective: int = Field(ge=0)
    final_objective: int = Field(ge=0)
    objective_history: list[ObjectivePoint]
    runtime_ms: float = Field(ge=0)
    initial_arrangement: list[VehiclePlacement] | None = None
    iterations_completed: int | None = Field(default=None, ge=0)
    neighbors_evaluated: int | None = Field(default=None, ge=0)
    stop_reason: HillClimbingStopReason | None = None
    sideways_moves: int | None = Field(default=None, ge=0)
    restarts_completed: int | None = Field(default=None, ge=0)
    iterations_per_restart: list[Annotated[int, Field(ge=0)]] | None = None


class RunModel(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    random_seed: int
    configHash: str
    config: ConfigModel
    settings: (
        HillClimbingSettings | SimulatedAnnealingSettings | GeneticAlgorithmSettings
    ) = Field(discriminator="algorithm")
    result: RunResult
