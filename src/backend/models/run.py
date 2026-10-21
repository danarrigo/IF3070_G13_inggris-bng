from datetime import UTC, datetime
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

from models.config import ConfigModel


class HillClimbingSettings(BaseModel):
    algorithm: Literal["hill_climbing"]
    iterations: int = Field(gt=0)


class SimulatedAnnealingSettings(BaseModel):
    algorithm: Literal["simulated_annealing"]
    iterations: int = Field(gt=0, le=10000)
    initial_temperature: float = Field(gt=0, le=1e12, allow_inf_nan=False)
    cooling_rate: float = Field(gt=0, lt=1, allow_inf_nan=False)
    minimum_temperature: float = Field(default=0.001, ge=1e-12, allow_inf_nan=False)
    stagnation_window: int = Field(default=100, gt=0)


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


class AnnealingPoint(BaseModel):
    iteration: int
    temperature: float
    objective: int
    best_objective: int
    delta: int | None
    log_acceptance: float | None
    exponential: float | None
    acceptance_probability: float
    accepted: bool
    candidate_found: bool


class StateSnapshot(BaseModel):
    iteration: int
    objective: int
    arrangement: list[VehiclePlacement]


class RunResult(BaseModel):
    final_arrangement: list[VehiclePlacement]
    unloaded_vehicle_ids: list[UUID]
    initial_objective: int = Field(ge=0)
    final_objective: int = Field(ge=0)
    objective_history: list[ObjectivePoint]
    runtime_ms: float = Field(ge=0)
    initial_arrangement: list[VehiclePlacement] = Field(default_factory=list)
    last_arrangement: list[VehiclePlacement] = Field(default_factory=list)
    best_objective: int = Field(default=0, ge=0)
    iterations_completed: int = Field(default=0, ge=0)
    stuck_count: int = Field(default=0, ge=0)
    stop_reason: str = ""
    annealing_history: list[AnnealingPoint] = Field(default_factory=list)
    snapshots: list[StateSnapshot] = Field(default_factory=list)


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
