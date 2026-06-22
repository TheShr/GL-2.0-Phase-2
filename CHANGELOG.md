# Changelog — Project Atlas Remediation

All notable engineering fixes, improvements, and architectural remediations for Project Atlas are documented in this file.

## [1.1.0] - 2026-06-22

### Fixed
* **Timezone Double-Shift Correction**: Stripped UTC naive offsets and mapped US Pacific citations timezone correctly to Indian Standard Time (IST) in `data_pipeline.py`, fixing the 8-hour shift and aligning peak traffic hours.
* **Toy Physics Remediation**: Replaced static constriction factor (0.3) with a weighted PCU/vehicle footprint calculation dynamically computed based on active violation types and lane widths. Blended free-flow and congested Greenshields model branches using a sigmoid function around critical density in `recommendation_engine.py`.
* **Honest API Degradation**: Replaced silent mock generators with absolute honest degradation. If Mappls APIs (Elevation, Route ETA, Distance Matrix) fail, the UI surfaces a visible "Data Unavailable" warning badge.
* **Mappls Token Leakage Safeguard**: Proxied client geocoding, autocomplete, and routing queries server-side via backend APIs, preventing token leakage in frontend JavaScript bundles.
* **LLM Prompt Injection Defense**: Stripped instruction override tags and structured incoming chat queries utilizing distinct User and System message roles in Copilot endpoints.

### Added
* **Dynamic Cell Transmission Model (CTM)**: Implemented Daganzo cell-to-cell flow update equations to model corridor shockwave propagation (backward-moving density updates) dynamically.
* **Geohash-Based Directory Caching**: Implemented a nested geohash directory lookup cache (4-character precision) for elevation and POI data to protect Mappls query quotas and bypass rate limits.
* **Mappls Service Degradation State**: Integrated an immediate honest degradation bypass that halts network requests once an authentication or route error occurs (401/403/404/412), speeding up execution from minutes to milliseconds.
* **Parallel Decomposed ILP Solver**: Partitioned the global 338-node Integer Linear Program (ILP) into parallelized station-level sub-problems solved concurrently using SciPy MILP.
* **LP Relaxation Fallback**: Added a SciPy `linprog` LP relaxation solver with randomized rounding to allocate patrol units when MILP bounds are too large or time out.
* **Transit-Time Routing & Station Boundary Penalties**: Incorporated officer travel times based on station centroids and applied a +15-minute travel cost penalty for cross-jurisdictional boundary dispatches.
* **Adaptive DBSCAN Spatial Clustering**: Replaced global fixed-radius DBSCAN with adaptive `eps` parameters calculated per police station boundary using 4th-nearest-neighbor distances.
* **Frank-Wolfe User Equilibrium Routing**: Added a traffic assignment loop in the corridor simulation to dynamically redirect drivers onto detours when primary corridors are congested.
* **Live GPS Officer Tracking**: Implemented a mock GPS state machine in the React optimizer UI showing en route transit states and requiring a manual "Confirm Arrival" officer check.
* **Configurable System Parameters**: Consolidated SLA multipliers, delay threshold metrics, and Flipkart hubs configurations out of source code into `constants.json` and `hubs_config.json`.
* **Remediation Assertions Suite**: Created `verify_remediation.py` to assert correct timezone IST peaks, GNN model dimension differences, CTM shockwave delay propagation, and decomposed ILP solver allocations.
