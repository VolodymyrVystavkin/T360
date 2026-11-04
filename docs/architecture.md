# Architecture and API

The standalone Angular application uses template-driven forms, Angular signals for request state, Angular Material controls, and an injectable HttpClient service. Input edits invalidate previous results. The application disables stack edits while a calculation runs and renders errors with an accessible alert. JSON export includes the request and returned results.

FastAPI validates requests with Pydantic and calls a pure calculation function. No state is shared between requests. The synchronous endpoint executes in FastAPI's worker thread pool. NumPy generates samples with a request-local random generator. Insights are deterministic engineering rules, not LLM output.

## Routes

- `GET /api/health`: `{"status":"ok"}`.
- `POST /api/tolerance/analyze`: JSON request with components, lower_spec, upper_spec, samples (default 10000), seed (default 42). Each component has name, nominal, tolerance and optional coefficient (default 1).
- `GET /docs`: generated OpenAPI UI; `/openapi.json`: machine-readable schema.

The analysis response contains nominal, worst_case and rss objects (lower, upper, half_width), monte_carlo statistics (mean, standard_deviation, minimum, maximum, p025, p975, yield_percent, counts, bin_edges, samples, seed), and insights. Invalid requests return HTTP 422 with validation details.

Development uses Angular's `/api` proxy. Containers use nginx as the frontend server and reverse proxy. Static asset fallback supports Angular navigation; API paths always go to FastAPI. CORS is configurable for direct cross-origin API clients.

This is a local engineering tool without authentication, durable storage, rate limiting or a remote AI integration. Add those capabilities before exposing it to shared public traffic.
