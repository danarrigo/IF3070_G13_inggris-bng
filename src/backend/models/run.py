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


class PopulationPoint(BaseModel):
    generation: int = Field(ge=0)
    maximum: int = Field(ge=0)
    average: float = Field(ge=0)


class DemoIndividual(BaseModel):
    id: str
    fitness: int
    arrangement: list[VehiclePlacement]


class DemoStep(BaseModel):
    kind: Literal["population", "elite", "roulette", "crossover", "validation", "mutation", "admission", "generation"]
    generation: int
    pair: int | None = None
    child: int | None = None
    message: str
    individuals: list[DemoIndividual] = Field(default_factory=list)
    parent_ids: list[str] = Field(default_factory=list)
    parents: list[list[VehiclePlacement]] = Field(default_factory=list)
    arrangement: list[VehiclePlacement] | None = None
    before: list[VehiclePlacement] | None = None
    fitness: list[int] = Field(default_factory=list)
    selected_index: int | None = None
    draw: float | None = None
    draw_kind: Literal["weighted", "uniform", "rate"] | None = None
    rate: float | None = None
    cut: int | None = None
    attempt: int | None = None
    accepted: bool | None = None
    retained_children: list[int] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    changed_vehicle_ids: list[UUID] = Field(default_factory=list)
    operation: str | None = None


class DemoTrace(BaseModel):
    version: Literal[1] = 1
    steps: list[DemoStep] = Field(default_factory=list)


class RunResult(BaseModel):
    demo_recorded: bool = False
    demo_trace: DemoTrace | None = None
    # Optional for runs saved before actual starting arrangements were recorded.
    initial_arrangement: list[VehiclePlacement] | None = None
    population_history: list[PopulationPoint] = Field(default_factory=list)
    generations_completed: int | None = Field(default=None, ge=0)
    final_arrangement: list[VehiclePlacement]
    unloaded_vehicle_ids: list[UUID]
    initial_objective: int = Field(ge=0)
    final_objective: int = Field(ge=0)
    objective_history: list[ObjectivePoint]
    runtime_ms: float = Field(ge=0)


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
