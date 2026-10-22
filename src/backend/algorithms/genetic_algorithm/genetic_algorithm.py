"""
Alur cara kerja genetic algo nya:
- fitness value = total shipping fee kendaraan yang dimuat di kapal

- selection parent pakai algo Roulette Wheel Selection (src: https://www.geeksforgeeks.org/dsa/genetic-algorithms/)
    - probabilitas tiap individu di roulette wheel ditentukan dengan fitness value individu itu
    - semakin tinggi fitness value, semakin besar their share of pie nya
    - kalau semua fitness nol, peluang tiap individu dibuat sama
    - parent boleh kepilih lagi, jadi A x B berulang atau A x A itu boleh (karena one point crossovernya milih titik random)

- one-point crossover
    - satu pasangan parent menghasilkan 2 child
    - crossover_rate diundi sekali per pasangan setelah selection parent
    - kalau ga terpilih crossover, kedua child menyalin parent masing-masing
    - titik potong dipilih random dari 1 sampai jumlah kendaraan - 1
    - urutan gen mengikuti semua kendaraan di config, termasuk yang di luar kapal
    - child 1 ambil bagian awal parent 1 dan bagian akhir parent 2
    - child 2 kebalikannya
  reject + retry
    - tiap calon child dicek pake func validate_arrangement()
    - child valid dipertahankan, child tidak valid dicoba lagi dengan titik potong baru
    - parent tetap sama dan crossover_rate ga diundi ulang pas retry
    - berhenti kalau kedua child valid atau sudah MAX_CROSSOVER_ATTEMPTS (20)
    - kalau sampai batas masih ada child tidak valid, hanya child itu yang menyalin parentnya

- mutasi
    - mutation_rate diundi terpisah untuk tiap child setelah proses crossover
    - child yang cuma salinan parent juga tetap bisa kena mutasi
    - kalau terpilih, coba ubah chromosome pake func random_neighbor() dari neighbors.py
    - either: one swap || move to another coordinate || orientation change || load || unload
    - kalau ga ketemu neighbor valid, child tetap seperti sebelumnya
    - bisa jadi chromosome tidak mendapatkan mutasi
    - mutasi ga harus menghasilkan fitness yang lebih bagus
    - persentase crossover dan mutation itu peluang, bukan jumlah pasti yang harus terjadi

- satu elite
    - cari individu dengan fitness tertinggi pada setiap generasi (di awal generasi)
    - kalau ada yang seri, pilih salah satu secara random
    - salin langsung ke populasi berikutnya tanpa crossover dan mutasi
    - isi sisa slot dengan anak hasil reproduksi
    - kedua child masuk kalau slot masih cukup
    - kalau slot tinggal satu, pilih random salah satu child
    - child ga diseleksi lagi berdasarkan fitness untuk masuk ke populasi baru
    - ukuran populasi tetap, elite termasuk di dalamnya
    - menjaga fitness terbaik agar tidak turun, tapi rata-rata fitness masih bisa turun

- ulangi sampai jumlah generasi dari input user tercapai atau user menekan Stop
    - generasi 0 adalah populasi awal
    - hasil akhirnya solusi terbaik yang ditemukan, belum tentu optimum global
"""

from collections.abc import Callable, Sequence
from random import Random
from time import perf_counter

from algorithms.initialization import initialize_arrangement
from algorithms.genetic_algorithm.demo import DemoRecorder, mutation_change
from algorithms.neighbors import random_neighbor
from algorithms.objective import calculate_objective
from algorithms.validation import validate_arrangement
from models.config import ConfigModel
from models.run import (
    GeneticAlgorithmSettings, ObjectivePoint, PopulationPoint, RunResult,
    VehiclePlacement,
)

# satu individu adalah satu daftar placement kendaraan yang dimuat di kapal.
Individual = list[VehiclePlacement]
ProgressCallback = Callable[[PopulationPoint, Individual], None]
MAX_CROSSOVER_ATTEMPTS = 20


class SearchCancelled(Exception):
    """Menandai pencarian yang dihentikan. Hasil parsial tidak disimpan sebagai run selesai."""


def check_cancelled(should_stop: Callable[[], bool] | None) -> None:
    if should_stop is not None and should_stop():
        raise SearchCancelled()


"""salin placement agar perubahan pada child tidak ikut mengubah parentnya"""
def copy_individual(individual: Sequence[VehiclePlacement]) -> Individual:
    
    return [placement.model_copy(deep=True) for placement in individual]


"""
pilih induk berdasarkan fitness
induk yang sama boleh terpilih lagi sebagai parent
"""
def roulette_selection(
    population: list[Individual], fitness: list[int], rng: Random,
    recorder: DemoRecorder | None = None, parent_number: int = 1,
) -> Individual:
    
    total_fitness = sum(fitness)

    if total_fitness == 0:
        # misal semua fitness di populasi nol, setiap individu dibuat punya peluang yang sama
        index = rng.choice(range(len(population)))
        draw = index
        kind = "uniform"
    else:
        # cth fitness [100, 300, 600] menghasilkan batas [100, 400, 1000]
        cumulative = []
        running_total = 0
        for score in fitness:
            running_total += score
            cumulative.append(running_total)

        # simpen draw antara 0..1 untuk visualisasi roulette
        draw = rng.random()
        kind = "weighted"
        target = draw * total_fitness

        # individu terakhir menjadi cadangan jika pembulatan mencapai batas akhir
        index = len(population) - 1
        for i, upper_bound in enumerate(cumulative):
            if target < upper_bound:
                index = i
                break

    # ini untuk seterusnya ke bawah (karena kode ini muncul terus di bawah):
    # maksud recorder ini itu bakal dipakai hanya jika si user nanti ceklist "Rekam proses untuk demo" di UI nya
    # kalau engga ya ini di ignore aja
    if recorder is not None:
        recorder.add(
            "roulette",
            f"Individu G{recorder.generation}-I{index + 1} terpilih sebagai induk {parent_number}.",
            fitness=fitness,
            selected_index=index,
            draw=draw,
            draw_kind=kind,
            arrangement=population[index],
        )
    return population[index]


"""gabung induk satu sama lain, pertahankan anak valid, lalu ulangi anak yang belum valid"""
def crossover(
    config: ConfigModel, first: Individual, second: Individual, rng: Random,
    *, max_attempts: int = MAX_CROSSOVER_ATTEMPTS, recorder: DemoRecorder | None = None,
) -> tuple[Individual, Individual]:

    if max_attempts <= 0:
        raise ValueError("max_attempts must be positive.")

    if len(config.vehicles) < 2:
        if recorder is not None:
            recorder.add(
                "crossover",
                "Crossover dilewati: kendaraan kurang dari dua.",
                parents=[first, second],
            )
        return copy_individual(first), copy_individual(second)

    # cari placement berdasarkan id, karena daftar kendaraan yang dimuat bisa berbeda
    # gen tetap mengikuti urutan config.vehicles dan id yang tidak ditemukan berarti luar
    first_placements = {placement.vehicle_id: placement for placement in first}
    second_placements = {placement.vehicle_id: placement for placement in second}
    parents = [first_placements, second_placements]
    children: list[Individual | None] = [None, None]

    for attempt in range(1, max_attempts + 1):
        cut = rng.randrange(1, len(config.vehicles)) # menentukan titik potong one point crossover
        # example: randrange(1, 5) = 2
        # Urutan gen: V1 V2 | V3 V4 V5
        # Indeks:      0  1 |  2  3  4

        for child_index in range(2):
            # anak yang sudah valid tidak dibuat ulang, lanjut ke anak yang belom valid
            if children[child_index] is not None:
                continue

            candidate: Individual = []
            for vehicle_index, vehicle in enumerate(config.vehicles):
                # anak 1: awal induk 1, akhir induk 2
                # anak 2: awal induk 2, akhir induk 1
                if vehicle_index < cut:
                    source_parent = parents[child_index]
                else:
                    # 1 - child_index menukar indeks 0 menjadi 1, dan 1 menjadi 0
                    source_parent = parents[1 - child_index]

                placement = source_parent.get(vehicle.id)
                if placement is not None:
                    candidate.append(placement.model_copy(deep=True))

            # ngembaliin pesan errornya klo emang ada error, klo g ya ngebalikin list kosong []
            errors = validate_arrangement(config, candidate) 
            
            if recorder is not None:
                message = f"Percobaan {attempt}, anak {child_index + 1}: "
                if errors:
                    message += "ditolak; coba titik potong baru."
                else:
                    message += "valid; dipertahankan."
                retained_children = [i + 1 for i, child in enumerate(children) if child is not None]
                recorder.add(
                    "validation", message,
                    child=child_index + 1,
                    attempt=attempt,
                    cut=cut,
                    arrangement=candidate,
                    errors=errors,
                    accepted=not errors,
                    retained_children=retained_children,
                )

            if not errors:
                children[child_index] = candidate

        # berhenti mencoba ketika kedua anak sudah valid
        if children[0] is not None and children[1] is not None:
            break

    # rekam fallback sebelum mengisi anak yang belum valid dengan salinan induk.
    if recorder is not None:
        original_parents = [first, second]
        for i, child in enumerate(children):
            if child is None:
                recorder.add(
                    "crossover",
                    f"Batas {max_attempts} percobaan habis. Anak {i + 1} menyalin induk {i + 1}.",
                    child=i + 1,
                    arrangement=original_parents[i],
                    parents=[first, second],
                    operation="fallback",
                )

    first_child, second_child = children
    if first_child is None:
        first_child = copy_individual(first)
    if second_child is None:
        second_child = copy_individual(second)
    return first_child, second_child


"""
coba satu pemanggilan random_neighbor jika undian mutasi terpilih
fungsi ini akan mutate 1 child saja (bukan kedua anak dari parentnya)
"""
def mutate(
    config: ConfigModel, child: Individual, rate: float, rng: Random,
    recorder: DemoRecorder | None = None, child_index: int | None = None,
) -> Individual:
    
    draw = rng.random()
    result = child
    operation = "not selected"
    changed_ids = []

    if draw < rate:
        changed = random_neighbor(config, child, rng)
        if changed is not None:
            result = changed
            if recorder is not None and recorder.enabled:
                operation, changed_ids = mutation_change(child, changed)
        else:
            operation = "no valid neighbor"

    if recorder is not None:
        if draw >= rate:
            message = "Mutasi tidak terpilih."
        elif result is child:
            message = "Tidak ditemukan neighbor valid; anak dipertahankan."
        else:
            message = f"Mutasi diterima: {operation}."
        recorder.add(
            "mutation", message,
            child=child_index,
            draw=draw,
            draw_kind="rate",
            rate=rate,
            before=child,
            arrangement=result,
            operation=operation,
            changed_vehicle_ids=changed_ids,
        )
    return result


"""
jalankan GA tanpa akses http/database.
callback menerima salinan data
"""
def run_genetic_algorithm(
    config: ConfigModel, settings: GeneticAlgorithmSettings,
    initial_arrangement: Sequence[VehiclePlacement], rng: Random,
    on_progress: ProgressCallback | None = None,
    *, record_demo: bool = False, should_stop: Callable[[], bool] | None = None,
) -> RunResult:
    
    started = perf_counter()
    check_cancelled(should_stop)

    # periksa batas mode demo dan validitas susunan awal
    if record_demo:
        demo_too_large = (
            settings.population_size > 10
            or settings.iterations > 10
            or len(config.vehicles) > 30
        )
        if demo_too_large:
            raise ValueError("Demo recording supports at most 10 individuals, 10 generations, and 30 vehicles.")

    recorder = DemoRecorder(record_demo)
    errors = validate_arrangement(config, initial_arrangement)
    if errors:
        raise ValueError("; ".join(errors))

    # individu pertama memakai input awal
    # sisanya dibuat secara acak
    population = [copy_individual(initial_arrangement)]
    for _ in range(settings.population_size - 1):
        check_cancelled(should_stop)
        population.append(initialize_arrangement(config, rng))

    history: list[PopulationPoint] = []
    initial_best: Individual = []
    best: Individual = []

    # generasi 0 adalah populasi awal, jadi statistik memiliki iterations + 1 titik
    for generation in range(settings.iterations + 1):
        check_cancelled(should_stop)
        recorder.generation = generation
        recorder.pair = None

        # hitung fitness seluruh individu
        fitness = []
        for individual in population:
            check_cancelled(should_stop)
            fitness.append(calculate_objective(config, individual))

        # cari fitness tertinggi
        # jika seri, pilih acak dari kandidat terbaik
        maximum = max(fitness)
        best_candidates = []
        for i, individual in enumerate(population):
            if fitness[i] == maximum:
                best_candidates.append(individual)
        best = rng.choice(best_candidates)

        # gunakan identitas objek (is), karena dua individu bisa punya isi sama
        best_index = 0
        for i, individual in enumerate(population):
            if individual is best:
                best_index = i
                break

        recorder.add(
            "population",
            f"Populasi generasi {generation}: setiap kartu adalah satu solusi.",
            individuals=recorder.population(population, fitness, generation),
        )
        point = PopulationPoint(
            generation=generation,
            maximum=maximum,
            average=sum(fitness) / len(fitness),
        )
        history.append(point)

        if generation == 0:
            initial_best = copy_individual(best)
        if on_progress is not None:
            on_progress(point.model_copy(), copy_individual(initial_best))
        check_cancelled(should_stop)

        # generasi terakhir cukup dievaluasi, tidak perlu bereproduksi lagi
        if generation == settings.iterations:
            break

        # elitism --> satu individu terbaik di generasi sebelumnya disalin tanpa mutasi/crossover
        next_population = [copy_individual(best)]
        recorder.add(
            "elite",
            f"G{generation}-I{best_index + 1} dipilih sebagai elite (fitness {maximum}); disalin tanpa perubahan.",
            selected_index=best_index,
            arrangement=best,
            individuals=recorder.population(next_population, [maximum], generation + 1),
        )

        # isi slot tersisa melalui seleksi, crossover, dan mutasi
        pair = 0
        while len(next_population) < settings.population_size:
            check_cancelled(should_stop)
            pair += 1
            recorder.pair = pair
            first = roulette_selection(population, fitness, rng, recorder, 1)
            second = roulette_selection(population, fitness, rng, recorder, 2)

            # ID induk digunakan untuk menghubungkan kartu pada replay demo.
            parent_ids = []
            for parent in (first, second):
                for i, individual in enumerate(population):
                    if individual is parent:
                        parent_ids.append(f"G{generation}-I{i + 1}")
                        break

            draw = rng.random()
            if draw < settings.crossover_rate:
                message = "Crossover terpilih; dua anak akan dicoba."
            else:
                message = "Crossover dilewati; kedua anak menyalin induknya."
            recorder.add(
                "crossover", message,
                parents=[first, second],
                parent_ids=parent_ids,
                draw=draw,
                draw_kind="rate",
                rate=settings.crossover_rate,
            )

            if draw < settings.crossover_rate:
                children = crossover(config, first, second, rng, recorder=recorder)
            else:
                children = copy_individual(first), copy_individual(second)

            offspring = []
            for i, child in enumerate(children):
                mutated_child = mutate(config, child, settings.mutation_rate, rng, recorder, i + 1)
                offspring.append(mutated_child)

            remaining_slots = settings.population_size - len(next_population)
            if remaining_slots == 1:
                # Kedua anak sudah diproses; pilih acak satu untuk slot terakhir.
                chosen = rng.choice(offspring)
                admitted = []
                for i, child in enumerate(offspring):
                    if child is chosen:
                        admitted.append(i + 1)
                        break
                next_population.append(chosen)
            else:
                admitted = [1, 2]
                next_population.extend(offspring)

            # fitness tambahan ini hanya diperlukan untuk kartu replay demo.
            demo_fitness = []
            if record_demo:
                for individual in next_population:
                    demo_fitness.append(calculate_objective(config, individual))

            admitted_labels = [str(child_number) for child_number in admitted]
            message = f"Anak {', '.join(admitted_labels)} masuk ke populasi baru."
            if len(admitted) == 1:
                message += " Satu anak lain tidak dimasukkan karena slot tinggal satu."
            recorder.add(
                "admission", message,
                retained_children=admitted,
                individuals=recorder.population(next_population, demo_fitness, generation + 1),
            )

        recorder.pair = None
        demo_fitness = []
        if record_demo:
            for individual in next_population:
                demo_fitness.append(calculate_objective(config, individual))
        recorder.add(
            "generation",
            f"Generasi {generation + 1} lengkap: satu elite dan anak-anak yang diterima.",
            individuals=recorder.population(next_population, demo_fitness, generation + 1),
        )

        # populasi baru menjadi populasi yang dievaluasi pada iterasi berikutnya
        population = next_population

    # susun hasil akhir beserta daftar kendaraan di luar dan riwayat fitness
    check_cancelled(should_stop)
    loaded = {placement.vehicle_id for placement in best}
    unloaded_vehicle_ids = [vehicle.id for vehicle in config.vehicles if vehicle.id not in loaded]
    objective_history = [
        ObjectivePoint(iteration=point.generation, objective=point.maximum)
        for point in history
    ]

    return RunResult(
        demo_recorded=record_demo,
        demo_trace=recorder.finish(),
        initial_arrangement=initial_best,
        final_arrangement=copy_individual(best),
        unloaded_vehicle_ids=unloaded_vehicle_ids,
        initial_objective=history[0].maximum,
        final_objective=history[-1].maximum,
        objective_history=objective_history,
        population_history=history,
        generations_completed=settings.iterations,
        runtime_ms=(perf_counter() - started) * 1000,
    )
