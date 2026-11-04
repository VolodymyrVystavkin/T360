# Tolerance model

For independent components with nominal dimension `nᵢ`, symmetric half-tolerance `tᵢ ≥ 0`, and signed linear coefficient `aᵢ`:

- Nominal stack: `N = Σ aᵢ nᵢ`.
- Worst-case half-width: `W = Σ |aᵢ| tᵢ`; guaranteed bounds under the stated component limits are `N ± W`.
- RSS half-width: `R = √Σ (aᵢ tᵢ)²`; reported bounds are `N ± R`.
- Monte Carlo: `Y = N + Σ aᵢ Uᵢ`, with independent `Uᵢ ~ Uniform(-tᵢ, tᵢ)`.

RSS here is a conventional tolerance index. It is not a guaranteed interval or a specified confidence interval. Under this uniform model, the theoretical standard deviation is `R / √3`. No normality assumption or three-sigma interpretation is applied.

Simulation uses NumPy `default_rng(seed)` and generates one component vector at a time. The same ordered request in the same dependency environment yields the same result. Reordering components can change the realization. It reports sample standard deviation (`ddof=1`), minimum/maximum, 2.5th/97.5th percentiles, 30 histogram bins, and the percentage within inclusive specification limits. Finite-sample yield is an estimate; it does not guarantee manufacturing yield. Monte Carlo quantiles are empirical, not confidence bounds on yield.

Limits: 1–100 components, 100–200,000 samples, integer seed 0–2³²−1, finite numbers, and lower specification strictly below upper specification. Nominals are bounded to ±10⁹, tolerances to 10⁶, coefficients to ±1000, and specifications to ±10¹⁵. The API rejects extra fields. These constraints bound CPU and memory for local use. No correlation, nonlinear geometry, asymmetric tolerances, unit conversion, or process drift is modeled.

The built-in example is a clearance: housing minus shaft minus spacer, nominal 0.5, worst-case half-width 0.35, RSS half-width approximately 0.22913. All values share one user-chosen unit.
