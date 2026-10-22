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


class PopulationPoint(BaseModel):
    generation: int = Field(ge=0)
    maximum: int = Field(ge=0)
    average: float = Field(ge=0)


class DemoIndividual(BaseModel):
    id: str
    fitness: int
    arrangement: list[VehiclePlacement]


class DemoStep(BaseModel):
    kind: Literal[
        "population",
        "elite",
        "roulette",
        "crossover",
        "validation",
        "mutation",
        "admission",
        "generation",
    ]
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
    demo_recorded: bool = False
    demo_trace: DemoTrace | None = None
    population_history: list[PopulationPoint] = Field(default_factory=list)
    generations_completed: int | None = Field(default=None, ge=0)
    final_arrangement: list[VehiclePlacement]
    unloaded_vehicle_ids: list[UUID]
    initial_objective: int = Field(ge=0)
    final_objective: int = Field(ge=0)
    objective_history: list[ObjectivePoint]
    runtime_ms: float = Field(ge=0)
    initial_arrangement: list[VehiclePlacement] | None = None
    iterations_completed: int | None = Field(default=None, ge=0)
    neighbors_evaluated: int | None = Field(default=None, ge=0)
    stop_reason: HillClimbingStopReason | Literal["minimum_temperature"] | None = None
    sideways_moves: int | None = Field(default=None, ge=0)
    restarts_completed: int | None = Field(default=None, ge=0)
    iterations_per_restart: list[Annotated[int, Field(ge=0)]] | None = None
    last_arrangement: list[VehiclePlacement] = Field(default_factory=list)
    best_objective: int = Field(default=0, ge=0)
    stuck_count: int = Field(default=0, ge=0)
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
