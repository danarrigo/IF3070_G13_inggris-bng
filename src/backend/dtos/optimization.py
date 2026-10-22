from pydantic import BaseModel, Field

from models.config import ConfigModel
from models.run import HillClimbingVariant


class HillClimbingRequest(BaseModel):
    config: ConfigModel
    random_seed: int = 42
    iterations: int = Field(default=100, gt=0, le=10000)
    show_neighbors: bool = False
    save_to_output: bool = False
    acknowledge_progress: bool = False
    variant: HillClimbingVariant = "steepest_ascent"
    max_sideways: int = Field(default=100, ge=0, le=10000)
    max_restart: int = Field(default=10, ge=0, le=1000)
