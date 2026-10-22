from models.run import DemoIndividual, DemoStep, DemoTrace


class DemoRecorder:
    def __init__(self, enabled: bool):
        self.enabled = enabled
        self.generation = 0
        self.pair: int | None = None
        self.steps: list[DemoStep] = []

    def add(self, kind, message, **details):
        if self.enabled:
            # freeze every nested placement now, before population objects change
            self.steps.append(
                DemoStep(
                    kind=kind,
                    generation=self.generation,
                    pair=self.pair,
                    message=message,
                    **details,
                ).model_copy(deep=True)
            )

    def population(self, population, fitness, generation):
        if not self.enabled:
            return []
        return [
            DemoIndividual(
                id=f"G{generation}-I{i + 1}", fitness=score, arrangement=individual
            )
            for i, (individual, score) in enumerate(
                zip(population, fitness, strict=False)
            )
        ]

    def finish(self):
        return DemoTrace(steps=self.steps) if self.enabled else None


"""
describe the accepted existing neighbor from its actual placement changes.
"""


def mutation_change(before, after):
    old, new = ({p.vehicle_id: p for p in state} for state in (before, after))
    changed = [
        vehicle_id
        for vehicle_id in dict.fromkeys([*old, *new])
        if old.get(vehicle_id) != new.get(vehicle_id)
    ]
    added, removed = new.keys() - old.keys(), old.keys() - new.keys()
    if added and removed:
        operation = "swap loaded/unloaded"
    elif added:
        operation = "load"
    elif removed:
        operation = "unload"
    elif len(changed) == 2:
        operation = "swap"
    elif changed and (old[changed[0]].length, old[changed[0]].width) != (
        new[changed[0]].length,
        new[changed[0]].width,
    ):
        operation = "rotate"
    else:
        operation = "move" if changed else "unchanged"
    return operation, changed
