from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class Ship(BaseModel):
    length: int = Field(gt=0)
    width: int = Field(gt=0)
    max_weight: int = Field(gt=0)


class Vehicle(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    x: int | None = Field(default=None, ge=0)
    y: int | None = Field(default=None, ge=0)
    length: int = Field(gt=0)
    width: int = Field(gt=0)
    weight: int = Field(gt=0)
    eta: int = Field(ge=0)
    shipping_fee: int = Field(ge=0)


class ConfigModel(BaseModel):
    ship: Ship
    vehicles: list[Vehicle]

