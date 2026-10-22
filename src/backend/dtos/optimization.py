from pydantic import BaseModel, Field

from models.config import ConfigModel


class SteepestAscentRequest(BaseModel):
    config: ConfigModel
    random_seed: int = 42
    iterations: int = Field(default=100, gt=0, le=10000)
    show_neighbors: bool = False
    acknowledge_progress: bool = False
