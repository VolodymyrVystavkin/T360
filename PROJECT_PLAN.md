# PROJECT_PLAN — AI Engineering Readiness: 8-Week Developer Challenge

> Source: supplied **Engineering_AI_RnD_8_Week_Developer_Challenge.html** and **Developer_Assignment_8_Weeks (1)(1).html** (November 2026). This document reorganizes the assignment for VS Code/Codex. It is a plan, not evidence of completed work.

## Project mandate

Build independent, clean-room engineering research prototypes: (A) tolerance and mechanism workbench (Weeks 1–4), (B) open-source CAD core (Weeks 3–5), (C) CFD and NVIDIA physics-AI experiment (Weeks 6–8), plus (D) evidence-grounded engineering agent orchestration (Weeks 5–8).

**Duration:** 8 weeks / 48 workdays / 6 days per week / 360–400 focused hours. **Passing:** at least 80/100 AND mandatory safety, mathematics, and traceability gates.

**Daily rhythm:** 60–90 min structured learning; 4–6 h implementation; 60–90 min evaluation/debugging; 30 min engineering log and commits. Every sixth day is a mentor review and quality gate.

## Engineering and development rules

- Implement clean-room features from public descriptions only. Do not copy proprietary code, assets, screens or restricted executables.
- Never expose proprietary customer CAD or drawings to external AI without written authorization. Respect licenses and dataset permissions.
- Treat numerical solvers and independently verified tests—not LLM prose—as the source of engineering calculations. No unvalidated simulation or GD&T claims.
- Use typed schemas, explicit units, source provenance, revision identifiers, and reproducible random seeds. Reject unsupported/ambiguous inputs.
- Keep four modules logically separated; do not rewrite existing commercial/internal applications.
- AI coding tools may assist, but record prompts, bugs, fixes and independent verification in daily logs.
- Preserve existing working features and tests when implementing subsequent weeks. Do not claim a milestone complete until its evidence is verified.

## Project charters

### A — Tolerance + mechanism workbench (mandatory, Weeks 1–4)

- Dimension models: nominal, asymmetric ± tolerances, distributions, sign conventions, revisions.
- Worst-case, RSS and seeded Monte Carlo with percentiles, probability and explicit assumptions.
- 2D pin-slot/linkage, angles, kinematics and motion envelope.
- Sensitivity, scenario comparison, toy tolerance-cost optimization.
- Interactive plots and machine-readable reports with evidence/limitations.

### B — Parametric CAD geometry core (mandatory, Weeks 3–5)

- Three parametric solids via build123d or CadQuery on OCCT.
- STEP import/export, shape validity, volume, bounding box, face types.
- Simple assembly transforms, nominal clearance and interference.
- Feature-to-dimension/revision binding; viewer and sandboxed generated CAD code.
- Stretch only: supported STEP AP242 semantic PMI, with honest unsupported-feature reporting.

### C — CFD + NVIDIA physics AI (advanced, Weeks 6–8)

- OpenFOAM or SU2 canonical laminar channel/cavity case.
- Automated setup, mesh checks, solver, plots and reference validation.
- NVIDIA Warp GPU kernel vs NumPy CPU reference with fair benchmark.
- Optional PhysicsNeMo-CFD compatible surrogate; fallback documented if infeasible.

### D — Evidence-grounded agent (cross-cutting, Weeks 5–8)

- LanceDB or Qdrant indexed sources with IDs, versions, snippets and hashes.
- LangGraph retrieval, planning, deterministic tool calls, verification, approval, checkpoints.
- Compare specialist multi-agent approach with simpler baseline.
- Abstain for missing PMI, unreadable documents, unsupported formulas or unit conflicts.
- Measure citations, correctness, latency, costs, recovery and leakage.

## Canonical acceptance fixtures

### Signed 1D tolerance stack

| Contributor | Nominal (mm) | Symmetric tolerance (mm) | Coefficient |
|---|---:|---:|---:|
| Housing | 20.00 | ±0.12 | +1 |
| Shaft | 10.00 | ±0.05 | −1 |
| Spacer | 9.80 | ±0.08 | −1 |

- Formula: `clearance = housing - shaft - spacer`.
- Expected nominal clearance: **0.20 mm**.
- Expected worst-case clearance: **−0.05 to +0.45 mm**.
- RSS 3σ half-width: **approximately 0.153 mm**, ONLY if independent, centered normal input deviations with each ± tolerance equal to 3σ.
- Monte Carlo acceptance fixture: **100,000 seeded samples**, with distribution, clipping, percentiles and failure probability explained.
- Negative clearance represents interference in this simplified axial model. RSS is not worst-case.

### CFD reference

- Fully developed planar Poiseuille profile: `u(y) = 6 * Umean * (y/H) * (1 - y/H)`.
- Target: **<5% maximum velocity-profile error** on an adequately refined, physically valid case; demonstrate mesh convergence and discuss entrance/boundary effects.

### STEP / PMI reference

- Use public NIST STEP/AP242 reference cases. A STEP file may lack semantic PMI; distinguish measured geometry from encoded GD&T. Never fabricate missing annotations.

## 48-day implementation roadmap

### Week 01 — AI-native coding + the first tolerance solver

Build the mathematical foundation. Reproduce a publicly documented tolerance-analysis workflow without copying proprietary code.

#### Day 01: Software archaeology and clean-room planning

- **Study / implement:** Research public Enventive feature descriptions; inspect 3 OSS engineering repos; create clean-room feature matrix and license ledger.
- **Evidence to submit:** Repo, architecture diagram, 12 prioritized user stories, provenance register.
- **Status:** Not verified

#### Day 02: AI-first development discipline

- **Study / implement:** Set up Python/uv, Git, tests, CI; use an AI code assistant for implementation and code review; document prompts and fixes.
- **Evidence to submit:** Reproducible dev container, coding-agent rules, failing-to-passing tests.
- **Status:** Not verified

#### Day 03: Engineering units and schemas

- **Study / implement:** Build typed models for nominal, tolerance plus/minus, units, revision, direction and source; add Pint.
- **Evidence to submit:** Validated CSV/JSON input with dimensional-analysis guardrails.
- **Status:** Not verified

#### Day 04: Worst-case stack engine

- **Study / implement:** Implement signed 1D chain calculation, asymmetric tolerance bounds, min/max, sign reversal, invalid cases.
- **Evidence to submit:** Independent spreadsheet/calculator comparison for 3 fixtures.
- **Status:** Not verified

#### Day 05: RSS and Monte Carlo

- **Study / implement:** Implement independent Gaussian RSS and Monte Carlo with seed, distributions, clipping and percentile results; explain assumptions.
- **Evidence to submit:** Test reproducibility, empirical-versus-analytic comparison, failure probability estimate.
- **Status:** Not verified

#### Day 06: Week-one engineering demo

- **Study / implement:** Expose solver as FastAPI + compact UI; add Docker, CI, readme, unit tests and architecture review.
- **Evidence to submit:** Live 8-minute demonstration; 30 meaningful tests; one AI-generated bug root-cause analysis.
- **Status:** Not verified

**Week 1 acceptance gate:** A tested standalone 1D tolerance-analysis API and basic interactive calculator; minimum 30 tests, 3 independently verified cases.

### Week 02 — 2D variation + mechanism behavior

Go beyond Excel-style 1D stacks: 2D parameter equations, constraints, sensitivity and an elementary moving mechanism.

#### Day 07: Constraint models and solvers

- **Study / implement:** Use SymPy + SciPy root/least_squares; represent point, line, angle and distance constraints; define under/over constraints.
- **Evidence to submit:** Solve 3 simple sketch mechanisms; handle non-convergence.
- **Status:** Not verified

#### Day 08: 2D geometric variation

- **Study / implement:** Model a pin-in-slot or two-link geometry with X/Y offsets, angles and clearance; solve across varied dimensions.
- **Evidence to submit:** Visualize 2D fit and show counterexample where 1D approximation fails.
- **Status:** Not verified

#### Day 09: Mechanism motion

- **Study / implement:** Build a crank-slider or four-bar mini simulation, motion limits and output gap across angle.
- **Evidence to submit:** Animated mechanism plus 20 numeric points and labeled assumptions.
- **Status:** Not verified

#### Day 10: Sensitivity and contribution

- **Study / implement:** Finite-difference or automatic derivative sensitivity, ranked contributors, tolerance budget; compare analytic and numeric.
- **Evidence to submit:** Sensitivity bar chart, perturbation tests, ranked table.
- **Status:** Not verified

#### Day 11: Optimization and economics

- **Study / implement:** Use SciPy optimize for a toy tradeoff of tolerances vs synthetic manufacturing cost and failure constraints.
- **Evidence to submit:** Before/after comparison; feasibility and cost-sensitivity note.
- **Status:** Not verified

#### Day 12: Competitor benchmark challenge

- **Study / implement:** Demo clean-room implementation against a public feature checklist: 1D, 2D, what-if, RSS, Monte Carlo, sensitivity, reports.
- **Evidence to submit:** 3-minute feature video, 2 unsupported features identified honestly, 45+ tests.
- **Status:** Not verified

**Week 2 acceptance gate:** Independent 2D geometry/variation solver; 1D regression maintained; show one optimized tolerance allocation with explicit assumptions.

### Week 03 — A free parametric CAD kernel from source

Build a mechanical CAD micro-application with build123d/CadQuery over OpenCASCADE, not merely an imported model viewer.

#### Day 13: CAD kernel architecture

- **Study / implement:** Read OCCT, FreeCAD and build123d/CadQuery docs; compare B-Rep vs mesh, STEP vs STL, topology naming and licenses.
- **Evidence to submit:** One-page build-vs-reuse architecture; license-compliance ledger.
- **Status:** Not verified

#### Day 14: Parametric solid modeling

- **Study / implement:** Use Python to generate bracket, spacer and shaft; extrusions, bores, fillets, parameter changes.
- **Evidence to submit:** Versioned CAD-as-code scripts; 3 STEP outputs.
- **Status:** Not verified

#### Day 15: STEP import and interrogate

- **Study / implement:** Import STEP solids, detect units, solids, surfaces, B-Rep topology, volume, bounding box and shape validity.
- **Evidence to submit:** Geometry inspection API with 10 fixture checks.
- **Status:** Not verified

#### Day 16: Topology selection and measurement

- **Study / implement:** Select planar/cylindrical faces with robust geometric predicates; compute plane distances, centerlines and clearances.
- **Evidence to submit:** Face/axis visualization; topological naming failure log.
- **Status:** Not verified

#### Day 17: Assemblies and transforms

- **Study / implement:** Create 3-part simple assembly with transforms, mating positions and basic interference checks; note limitations.
- **Evidence to submit:** Interactive assembly with parts tree, measurements and transformations.
- **Status:** Not verified

#### Day 18: CAD core gate demo

- **Study / implement:** Package as tiny web service + visual viewer; allow edit parameters and regenerate STEP.
- **Evidence to submit:** Cold regeneration from JSON, compare output shape properties.
- **Status:** Not verified

**Week 3 acceptance gate:** Generate three parametric parts, export/import STEP, calculate bounding box and volume; automated CAD regression tests.

### Week 04 — Geometry, GD&T and engineering evidence

Connect nominal CAD geometry to engineering design intent, limitations of GD&T interpretation and revision tracking.

#### Day 19: Datum frames and GD&T fundamentals

- **Study / implement:** Learn datums, feature controls, position vs size tolerances, MMC/LMC conceptually; use NIST public AP242 PMI cases.
- **Evidence to submit:** Illustrated engineering glossary; 12 evaluated sample questions.
- **Status:** Not verified

#### Day 20: Semantic PMI vs decorative annotation

- **Study / implement:** Investigate STEP AP242 semantic PMI; demonstrate supported and unsupported file contents without fabricating annotations.
- **Evidence to submit:** PMI capability matrix and failure/abstention tests.
- **Status:** Not verified

#### Day 21: Feature-to-dimension binding

- **Study / implement:** Associate holes/faces/axes with user-authored dimension/tolerance definitions plus revision IDs.
- **Evidence to submit:** Machine-readable feature graph with source links.
- **Status:** Not verified

#### Day 22: Assembly clearance experiment

- **Study / implement:** Perturb placement/size assumptions and analyze 3D nominal interference with OCCT; compare to signed 1D clearance.
- **Evidence to submit:** Three geometry-tolerance comparisons with explicit assumptions.
- **Status:** Not verified

#### Day 23: Revision and topology robustness

- **Study / implement:** Edit source CAD; distinguish changed shape topology from stable design intent; use persistent feature IDs when feasible.
- **Evidence to submit:** Rev A/B diff demonstrating at least 1 failed naive face mapping.
- **Status:** Not verified

#### Day 24: Week-four challenge

- **Study / implement:** Given unseen STEP and requirements, produce model report; reject unsupported full GD&T claims; review with mechanical mentor.
- **Evidence to submit:** Demo, STEP outputs, geometry test results and assumptions register.
- **Status:** Not verified

**Week 4 acceptance gate:** The CAD workbench can bind a controlled tolerance to a named feature, check 3 synthetic assembly clearances and report traceable calculations.

### Week 05 — Vector databases + LangGraph engineering agents

Add an evidence-seeking agent layer over the independent solvers, using LLMs for interpretation, never as the numeric authority.

#### Day 25: Embedding pipeline and metadata

- **Study / implement:** Index public docs, synthetic test cases, software manuals and project decision logs in LanceDB or Qdrant.
- **Evidence to submit:** Corpus 20+ files, chunk metadata, IDs, versions and source hashes.
- **Status:** Not verified

#### Day 26: Hybrid search evaluation

- **Study / implement:** Implement dense, lexical and hybrid retrieval with filters; create 30 labeled questions and 10 not-answerable cases.
- **Evidence to submit:** Recall@3 and abstention report; error taxonomy.
- **Status:** Not verified

#### Day 27: Tool interfaces and MCP

- **Study / implement:** Expose /calculate-stack, /inspect-step, /run-cfd with explicit schemas, validation, timeouts and allowlists; optionally MCP.
- **Evidence to submit:** Documented tool schemas with untrusted-input tests.
- **Status:** Not verified

#### Day 28: LangGraph state machine

- **Study / implement:** Build graph nodes: retrieve, plan, calculate, validate, human-approve and report; persist state/checkpoints.
- **Evidence to submit:** Reproducible paused/resumed runs and state diagram.
- **Status:** Not verified

#### Day 29: Specialist multi-agent experiment

- **Study / implement:** Compare single graph against planner, CAD analyst, tolerance analyst and verifier; prevent agents inventing geometry.
- **Evidence to submit:** Latency/cost/accuracy comparison, 5 deliberately bad requests.
- **Status:** Not verified

#### Day 30: Agent gate review

- **Study / implement:** Agent answers sourced questions, discloses unknowns, executes approved functions, flags engineering limitations.
- **Evidence to submit:** 5 end-to-end traces, 3 tool-error recoveries, no unsourced numeric answers.
- **Status:** Not verified

**Week 5 acceptance gate:** An agent retrieves versioned source evidence, invokes two deterministic calculation tools, and asks approval when evidence is ambiguous.

### Week 06 — Open-source CFD fundamentals

Build an automated CFD experiment on a narrow, checkable flow problem. Physics validation takes priority over impressive animations.

#### Day 31: CFD physics for developers

- **Study / implement:** Study continuity, Navier-Stokes concepts, Reynolds number, laminar/turbulent flow and dimensional analysis.
- **Evidence to submit:** 1-page physics assumptions and 15-question quiz.
- **Status:** Not verified

#### Day 32: Select solver and canonical problem

- **Study / implement:** Install OpenFOAM or SU2; choose laminar channel / lid-driven cavity tutorial; record solver/version/container.
- **Evidence to submit:** Baseline case runs and produces velocity/pressure outputs.
- **Status:** Not verified

#### Day 33: Mesh and boundary conditions

- **Study / implement:** Change geometry/grid density, inlets/outlets and time/solver controls under version control.
- **Evidence to submit:** 3 mesh resolutions; boundary-condition sanity checks.
- **Status:** Not verified

#### Day 34: Reference-validation experiment

- **Study / implement:** For plane Poiseuille use u(y)=6 Umean (y/H)(1-y/H); compare profile, flow conservation and pressure drop.
- **Evidence to submit:** Target <5% max profile error on refined mesh, justify exceptions.
- **Status:** Not verified

#### Day 35: Automated runner + visualization

- **Study / implement:** Build constrained job runner with resource caps, log parser, progress status and VTK/ParaView export.
- **Evidence to submit:** CSV/plot/report comparing 3 cases; failed-run handling.
- **Status:** Not verified

#### Day 36: CFD reproducibility gate

- **Study / implement:** Demonstrate cold run, convergence evidence, mesh sensitivity and interpretation without letting an LLM assert physics.
- **Evidence to submit:** A validated baseline and reproducibility report.
- **Status:** Not verified

**Week 6 acceptance gate:** Reproducible CFD case with mesh check, boundary-condition audit and quantitative comparison against an analytical or reference solution.

### Week 07 — NVIDIA GPU + physics AI evaluation

Use NVIDIA tooling where it adds measurable value, and learn when a CPU numerical solver is the right choice.

#### Day 37: GPU compute landscape

- **Study / implement:** Review CUDA, PyTorch, NVIDIA Warp, PhysicsNeMo and PhysicsNeMo CFD; verify drivers/GPU memory/install.
- **Evidence to submit:** Dependency-locked environment and feasibility decision log.
- **Status:** Not verified

#### Day 38: NVIDIA Warp kernel

- **Study / implement:** Write vectorized geometry, Monte Carlo or simple particle-update kernel and CPU NumPy reference.
- **Evidence to submit:** Output agreement tests and 3-size performance benchmark.
- **Status:** Not verified

#### Day 39: PhysicsNeMo model discovery

- **Study / implement:** Study PhysicsNeMo models/recipes, mesh representations, model cards, dataset requirements and restrictions.
- **Evidence to submit:** Choose either small supported surrogate evaluation or an explicit no-go.
- **Status:** Not verified

#### Day 40: Surrogate evaluation / fallback

- **Study / implement:** If feasible, reproduce PhysicsNeMo CFD benchmark on a supported sample; else create a PyTorch lightweight surrogate for CFD tutorial data.
- **Evidence to submit:** Accuracy, error heatmap and runtime; document out-of-distribution failures.
- **Status:** Not verified

#### Day 41: GPU/server deployment

- **Study / implement:** Dockerize CPU/GPU paths; resource budgets, telemetry, version and fallback logic; no unrestricted tool execution.
- **Evidence to submit:** Benchmark table and deployment reproducibility.
- **Status:** Not verified

#### Day 42: Research review

- **Study / implement:** Present what accelerated, what did not, cost/complexity, physical accuracy and limitations.
- **Evidence to submit:** Physics-AI benchmark report with a reproducible command.
- **Status:** Not verified

**Week 7 acceptance gate:** Quantitative runtime/accuracy comparison: baseline solver vs a GPU-accelerated kernel or a pretrained physics surrogate on compatible data.

### Week 08 — Independent product-style delivery + customer simulation

Ship three connected but independent technical demonstrators and prove forward-deployed engineering judgment.

#### Day 43: Productize the prototypes

- **Study / implement:** Clean interfaces for tolerance workbench, parametric CAD micro-app and CFD experiment; remove demo-only credentials.
- **Evidence to submit:** Three runnable demos in separate repos or reproducible modules.
- **Status:** Not verified

#### Day 44: Integrated engineering workflow

- **Study / implement:** Demonstrate: requirement -> retrieve evidence -> CAD parameter change -> tolerance recalculation -> CFD scenario/review.
- **Evidence to submit:** End-to-end trace with checkpoints and human signoff.
- **Status:** Not verified

#### Day 45: Red-team and edge cases

- **Study / implement:** Test incompatible units, STEP failures, missing PMI, contradictory source revisions, invalid mesh, out-of-range solver settings.
- **Evidence to submit:** 20+ adverse cases with expected behavior and remediation.
- **Status:** Not verified

#### Day 46: Cost, security and deployment

- **Study / implement:** Compare API versus local model, GPU/CPU cost, customer data isolation, logs/telemetry, provenance and third-party licenses.
- **Evidence to submit:** Deployment diagram, threat model, budget and per-workflow cost.
- **Status:** Not verified

#### Day 47: Customer discovery and discovery workshop

- **Study / implement:** Role-play an engineering manager with 200+ spreadsheets, CAD files and CFD backlog; ask questions, estimate ROI and propose pilot.
- **Evidence to submit:** 15-min discovery interview + concise scoped pilot proposal.
- **Status:** Not verified

#### Day 48: Blind final practical assessment

- **Study / implement:** New unseen mechanical fixture and CFD setting. Developer debugs injected defect, makes a verified model change and explains risk.
- **Evidence to submit:** Live 90-minute exam, final scorecard and pass/conditional/fail recommendation.
- **Status:** Not verified

**Week 8 acceptance gate:** Final 90-minute unseen engineering assessment; passing threshold 80/100 plus mandatory safety/math/traceability gates.

## Evaluation rubric

| Area | Points |
|---|---:|
| Clean-room feature research and problem framing | 10 |
| Engineering mathematics and validation | 20 |
| CAD kernel / STEP / geometric correctness | 20 |
| CFD physics and GPU/AI measurement | 15 |
| Vector DB / LangGraph / multi-agent tools | 15 |
| AI coding discipline, testing and reproducibility | 10 |
| Customer discovery / presentation / risk communication | 10 |
| Total | 100 |

**Automatic fail / remediation conditions:** uncorrected reproducible engineering math error; fabricated evidence/geometry; customer data leakage; unauthorized proprietary copying; failure to reproduce from fresh checkout; falsely certifying unvalidated CFD/GD&T.

## Required final submission

- Four logically separated repos/modules: tolerance, CAD, CFD, agent.
- Each: README, dependency/license ledger, setup instructions, Dockerfile or lockfile, examples, tests, short demo video.
- Daily engineering log with problems, AI prompts, code changes, sources, failures, fixes and independent verification.
- Public/synthetic benchmark suite plus separate hidden holdout suite; deterministic seeds.
- Architecture/dataflow/versioning/provenance/access-control/human-approval document.
- One-page customer pitch with scope, baseline, benefits, risks and unvalidated claims.
- Another engineer must be able to reproduce the three primary demos from a fresh clone without personal secrets.

## Final 90-minute practical exam

1. 10 min: customer requirements discovery.
2. 25 min: unseen STEP/CSV import and injected bug diagnosis.
3. 20 min: variation calculation and worst-case vs statistical explanation.
4. 15 min: modified CFD run or supplied reference validation.
5. 10 min: agent source retrieval and verified tool call.
6. 10 min: pilot recommendation, limitations and cost.

## Codex workflow and progress tracking

1. Read this plan and audit the existing repository before modifying files.
2. Map existing code/tests to each day and acceptance gate; mark `verified`, `partial`, `missing` or `blocked` only with file/test evidence.
3. Start with missing Week 1 work before Week 2; do not assume previous conversations/screenshots prove completion.
4. Propose a small implementation plan, then implement one scoped feature at a time with tests.
5. Run tests and independent reference calculations; show commands and actual results.
6. Maintain a changelog, assumptions register and daily engineering log; never invent test passes.
7. Do not automatically add drawing-image-to-CSV AI extraction: it is an optional separately scoped enhancement, not a specified Week 1/2 acceptance requirement.

## Public resources named in the assignment

- Enventive public feature descriptions: https://enventive.com/enventive-concept-tolerance-analysis-software/
- SymPy: https://docs.sympy.org/latest/index.html
- SciPy optimize: https://docs.scipy.org/doc/scipy/reference/optimize.html
- OCCT: https://github.com/Open-Cascade-SAS/OCCT
- build123d: https://github.com/gumyr/build123d
- FreeCAD: https://github.com/FreeCAD/FreeCAD
- NIST STEP/AP242 PMI cases: https://www.nist.gov/ctl/smart-connected-systems-division/smart-connected-manufacturing-systems-group/mbe-pmi-0
- OpenFOAM: https://www.openfoam.com/documentation/tutorial-guide
- SU2: https://github.com/su2code/SU2
- NVIDIA Warp: https://github.com/NVIDIA/warp
- NVIDIA PhysicsNeMo: https://github.com/NVIDIA/physicsnemo
- LangGraph: https://docs.langchain.com/oss/python/langgraph/overview
- LanceDB: https://github.com/lancedb/lancedb
- Qdrant: https://github.com/qdrant/qdrant

---

*This plan follows the provided November 2026 assignment. Implementation status is intentionally unverified until Codex audits the repository. Any future proposed changes should be labeled separately from assignment requirements.*
