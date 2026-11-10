"""Signed dimensional stack analysis in one consistent unit; symmetric inputs remain compatible."""
import math

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Component(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    name: str = Field(min_length=1, max_length=100)
    nominal: float = Field(ge=-1e9, le=1e9)
    tolerance: float = Field(ge=0, le=1e6)
    coefficient: float = Field(default=1, ge=-1000, le=1000)
    plus: float | None = Field(default=None, ge=0, le=1e6)
    minus: float | None = Field(default=None, ge=0, le=1e6)

    @model_validator(mode='after')
    def paired_bounds(self):
        if (self.plus is None) != (self.minus is None):
            raise ValueError('Specify both tolerance bounds')
        return self


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    components: list[Component] = Field(min_length=1, max_length=100)
    samples: int = Field(default=10000, ge=100, le=200000, strict=True)
    statistics: bool = True
    seed: int = Field(default=42, ge=0, le=4294967295, strict=True)
    lower_spec: float = Field(default=-1, ge=-1e15, le=1e15)
    upper_spec: float = Field(default=1, ge=-1e15, le=1e15)

    @model_validator(mode='after')
    def ordered_specs(self):
        if self.lower_spec >= self.upper_spec:
            raise ValueError('Lower specification must be below upper specification')
        return self


class Interval(BaseModel):
    lower: float
    upper: float
    half_width: float


class MonteCarlo(BaseModel):
    mean: float
    standard_deviation: float
    minimum: float
    maximum: float
    p025: float
    p975: float
    yield_percent: float
    counts: list[int]
    bin_edges: list[float]
    samples: int
    seed: int


class AnalysisResult(BaseModel):
    nominal: float
    worst_case: Interval
    rss: Interval | None
    monte_carlo: MonteCarlo | None
    insights: list[str]


def analyze(request: AnalysisRequest) -> AnalysisResult:
    nominal = math.fsum(c.coefficient * c.nominal for c in request.components)
    lower_terms, upper_terms, centers, halves = [], [], [], []
    for c in request.components:
        plus = c.tolerance if c.plus is None else c.plus
        minus = c.tolerance if c.minus is None else c.minus
        ends = (c.coefficient * -minus, c.coefficient * plus)
        lower_terms.append(min(ends))
        upper_terms.append(max(ends))
        centers.append(c.coefficient * (plus-minus)/2)
        halves.append((plus+minus)/2)
    contributions = [abs(c.coefficient) * half for c, half in zip(request.components, halves)]
    worst = math.fsum(contributions)
    wc = Interval(lower=nominal+math.fsum(lower_terms), upper=nominal+math.fsum(upper_terms), half_width=worst)
    if not request.statistics:
        return AnalysisResult(nominal=nominal, worst_case=wc, rss=None, monte_carlo=None,
                              insights=['Worst-case only. Statistical assumptions have not been confirmed.'])
    rss = math.hypot(*contributions)
    center = nominal + math.fsum(centers)
    rng = np.random.default_rng(request.seed)
    values = np.full(request.samples, nominal, dtype=float)
    # Generate one vector at a time to keep memory bounded by sample count.
    for c in request.components:
        values += c.coefficient * rng.uniform(-(c.tolerance if c.minus is None else c.minus),
                                               c.tolerance if c.plus is None else c.plus, request.samples)
    counts, edges = np.histogram(values, bins=30)
    low, high = np.quantile(values, [0.025, 0.975])
    passed = np.mean((values >= request.lower_spec) & (values <= request.upper_spec)) * 100
    dominant = max(zip(request.components, contributions), key=lambda pair: pair[1])[0]
    fits = wc.lower >= request.lower_spec and wc.upper <= request.upper_spec
    return AnalysisResult(
        nominal=nominal,
        worst_case=wc,
        rss=Interval(lower=center-rss, upper=center+rss, half_width=rss),
        monte_carlo=MonteCarlo(mean=float(values.mean()), standard_deviation=float(values.std(ddof=1)),
            minimum=float(values.min()), maximum=float(values.max()), p025=float(low), p975=float(high),
            yield_percent=float(passed), counts=counts.tolist(), bin_edges=edges.tolist(),
            samples=request.samples, seed=request.seed),
        insights=[
            'Worst-case stack fits within specifications.' if fits else 'Worst-case stack exceeds specifications; review component tolerances.',
            f'Largest tolerance contribution: {dominant.name}.',
            'Simulation assumes independent uniform component deviations. RSS is a tolerance index, not a confidence interval.',
        ],
    )


