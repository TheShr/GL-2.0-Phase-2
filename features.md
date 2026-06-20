# Atlas: Project Features & Architectural Details

This document provides a comprehensive breakdown of the features implemented in the **Atlas Smart City Intelligence** platform. It describes the core functionality, underlying models, algorithmic formulas, and key codebase components, with a clear distinction between the Minimum Viable Product (MVP) core and advanced extensions.

---

## Quick Reference: MVP vs. Advanced Features

The table below outlines the core components of the platform, categorized by their inclusion in the Minimum Viable Product (MVP).

| Feature / Component | Scope | MVP Status | Key Source Files |
| :--- | :--- | :---: | :--- |
| **Interactive Spatial Map & Dashboard** | Main UI displaying traffic hotspots and summary metrics. | **MVP** | [index.tsx](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/frontend/src/routes/index.tsx), [MapContainer.tsx](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/frontend/src/components/MapContainer.tsx) |
| **Data Cleansing & Snapping Pipeline** | GPS timezone alignment and snapping to corridors. | **MVP** | [data_pipeline.py](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/backend/src/data_pipeline.py), [road_network.py](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/backend/src/road_network.py) |
| **AI Traffic Risk Forecasting** | ST-GATv2 Graph Neural Network & XGBoost fallback modeling. | **MVP** | [model.py](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/backend/src/model.py), [train.py](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/backend/src/train.py) |
| **GIS Density Clustering** | Clustering localized grid coordinates into police jurisdictions. | **MVP** | [gis_layer.py](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/backend/src/gis_layer.py) |
| **ILP Patrol Scheduler** | Optimal distribution of officers utilizing linear programming. | **MVP** | [dispatcher.py](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/backend/src/dispatcher.py), [optimizer.tsx](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/frontend/src/routes/optimizer.tsx) |
| **Macroscopic Queuing Simulator** | counterfactual travel time solver based on traffic physics. | *Advanced* | [recommendation_engine.py](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/backend/src/recommendation_engine.py), [api.simulate.ts](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/frontend/src/routes/api.simulate.ts) |
| **Supply Chain Weighting** | Flipkart Hubs snapped locations and logistics index tracking. | *Advanced* | [logistics.tsx](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/frontend/src/routes/logistics.tsx) |
| **MapmyIndia (Mappls) REST Integration** | Geocoding, terrain mapping, snapped routing widgets. | *Advanced* | [mappls_service.py](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/backend/src/mappls_service.py) |
| **AI Traffic Copilot Chatbot** | Interactive assistant executing telemetry analysis via Groq. | *Advanced* | [copilot.tsx](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/frontend/src/routes/copilot.tsx), [api.copilot.ts](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/frontend/src/routes/api.copilot.ts) |

---

## 1. Data Cleaning & Snapping Pipeline

### Core Functionality
Processes raw traffic infraction records, executes geographic filtering, maps timestamps to Indian Standard Time (IST) for cyclical temporal encoding, and snaps unstructured GPS coordinate points to one of the 7 designated transit corridors in Bengaluru.

### Core Models & Math
- **cKDTree Spatial Snapping:** Fast $K$-dimensional tree spatial queries are used to snap GPS citation points to the nearest interpolated corridor node. If the Euclidean distance between citation coordinates and the snapped node exceeds a strict threshold of $4.4\text{ km}$, it is categorized as off-network noise and pruned.
- **Cyclical Temporal Encoding:** Extracts the hour and day, projecting them to circular sine/cosine coordinates to capture periodic daily and weekly profiles:
  $$\theta_{\text{hour}} = \frac{2\pi \cdot \text{hour}}{24}, \quad x_{\text{hour}} = \sin(\theta_{\text{hour}}), \quad y_{\text{hour}} = \cos(\theta_{\text{hour}})$$

### File & Method References
- [data_pipeline.py](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/backend/src/data_pipeline.py):
  - `clean_btp_data()`: Filters out invalid raw logs, handles timezone conversions to IST, and creates cyclical features.
- [road_network.py](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/backend/src/road_network.py):
  - `build_corridor_graph()`: Constructs Bengaluru's corridor node map (interpolated waypoints every $240\text{m}$ yielding $338$ nodes and $784$ edges).
  - `snap_points_to_corridors()`: Instantiates the `scipy.spatial.cKDTree` search to snap GPS coordinates to segment indices.
  - `inject_demographics_and_pois()`: Integrates Mappls POI counts within a $50\text{m}$ corridor buffer.

---

## 2. Interactive Spatial CommandCenter Dashboard `[MVP]`

### Core Functionality
The entry page (`/`) maps spatial traffic hotspots. The dashboard integrates real-time key performance indicators, dynamic checklist toggles for geographical layers (corporate, transit, commercial, elevation, and logistics hubs), recommended enforcement actions, and a detailed sidebar drawer presenting telemetry scores.

### Front-End & Map Frameworks
- **MapmyIndia (Mappls) Web SDK integration:** Mounts a fully interactive map using Mappls Web SDK v3.0, loading dynamic dark/night theme tiles and snapped routes on the map grid.
- **Leaflet Fallback Mode:** Implements a CartoDB Leaflet backup map that renders matching stylized markers, range overlays, and frosted glass InfoWindows when the SDK fails to load.
- **Frosted-Glass UI overlay:** Integrates premium design styling via CSS backdrop blurs (`backdrop-filter: blur(12px)`) and Harmonious HSL colors. 

### File & Method References
- [index.tsx](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/frontend/src/routes/index.tsx):
  - `CommandCenter()`: Coordinates layout, Executive Brief KPIs, recommended action strips, and the detail drawer.
- [MapContainer.tsx](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/frontend/src/components/MapContainer.tsx):
  - Renders map markers and overlays. Contains custom Leaflet/Mappls logic to display a temporary, highly visible search pin when a custom coordinate is looked up.
- [styles.css](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/frontend/src/styles.css):
  - Custom scrollbar overrides (webkit scrollbar track transparent, thumb mapped to `var(--border-hairline)`) providing a unified HUD look on scroll containers.

---

## 3. AI-Driven Spatiotemporal Risk Forecasting `[MVP]`

### Core Functionality
Predicts the risk of parking violations and traffic bottlenecks across all road segments for the next shift using deep spatial graph embeddings and historical patterns.

### Core Models & Math
- **Spatio-Temporal Graph Attention Network (ST-GATv2):** Combines spatial convolution layer constructs (`GATv2Conv`) with a recurrent temporal Gated Recurrent Unit (`GRU`) to learn spatial dependencies (road junctions) and temporal traffic trends.
- **Adaptive/Learnable Graph Topology ($A_{\text{adaptive}}$):** Resolves non-adjacent corridor dependencies by computing learnable node embeddings $E_1, E_2$ during training:
  $$A_{\text{adaptive}} = \text{Softmax}(\text{ReLU}(E_1 E_2^T))$$
- **Weighted Huber Loss with Node-Specific Deltas ($\delta_i$):** Replaces basic MSE with a robust regression target loss. Nodes in high-density corridors have larger thresholds ($\delta_{\text{high}} = 5.0$) while low-density segments use $\delta_{\text{low}} = 1.0$. Losses are weighted based on commercial density and historical violations:
  $$L_{\delta_i}(y_i, \hat{y}_i) = \begin{cases} \frac{1}{2}(y_i - \hat{y}_i)^2 & \text{for } |y_i - \hat{y}_i| \le \delta_i \\ \delta_i(|y_i - \hat{y}_i| - \frac{1}{2}\delta_i) & \text{otherwise} \end{cases}$$
  $$\text{weight}_i = 1.0 + 2.0 \cdot (\text{corporate\_density}_i + \text{transit\_density}_i) + 0.3 \cdot \log(1 + \text{total\_violations}_i)$$
- **Vulnerability Index ($VI_i$) Evening Multiplier:** Corrects reporting biases during rush hours (where police citations drop to zero due to shifts) by calculating a structural bottleneck risk:
  $$VI_i = 0.15 \cdot \text{POI\_Comm}_i + 0.15 \cdot \text{POI\_Trans}_i + 0.15 \cdot \text{POI\_Dine}_i + 0.15 \cdot \text{POI\_Corp}_i + 0.10 \cdot \text{Retail}_i + 0.10 \cdot \text{Kitchen}_i + 0.10 \cdot \text{eLoc}_i + 0.10 \cdot \left(\frac{1}{\text{Lanes}_i}\right)$$
- **Spatial-Lag XGBoost Regressor:** Serves as a high-precision fallback baseline modeled on spatial neighborhood averages.

### File & Method References
- [model.py](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/backend/src/model.py):
  - `STGATv2`: PyTorch architecture mapping `GATv2Conv` layers, adaptive adjacency matrices, and `GRU` sequences.
- [train.py](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/backend/src/train.py):
  - `train_stg_model()`: Handles data loading (using target log-transformations), calculates custom Huber weights, and trains the model.
  - `XGBoost Fallback`: Builds and evaluates tabular neighborhood spatial features.

---

## 4. Density-Based GIS Hotspot Clustering `[MVP]`

### Core Functionality
Groups forecasted risk scores of individual road nodes into localized regional hotspots. This matches administrative policing borders, translating predictions into actionable dispatch boundaries.

### Core Models & Math
- **DBSCAN (Density-Based Spatial Clustering of Applications with Noise):** Clusters segments using coordinate proximity ($\epsilon = 0.008$ degrees, approx. $900\text{m}$) and density requirements ($\text{MinPts} = 3$).
- **Centroid Geocoding:** Evaluates cluster centers and maps them to the nearest police station coordinates to identify local operational units.

### File & Method References
- [gis_layer.py](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/backend/src/gis_layer.py):
  - `cluster_forecasted_risks()`: Performs DBSCAN clustering on GNN risk outputs.
  - `match_police_stations()`: Determines station jurisdictions based on nearest Euclidean distances.

---

## 5. Integer Linear Programming (ILP) Patrol Dispatch Scheduler `[MVP]`

### Core Functionality
Takes the generated hotspots and schedules patrol dispatches. Users can adjust parameters (enforcement budget, priority weights, station limits) on the front-end to trigger the dispatcher and output optimal officer allocations.

### Core Models & Math
- **Global Integer Linear Programming (ILP) Optimization:** Replaces simple greedy scheduling with a global SciPy MILP solver.
- **Objective Function:** Maximize the total composite priority score of selected hotspots, normalized by the required officer count:
  $$\text{Maximize } \sum_{i} x_i \cdot \frac{w_1 \cdot C_i + w_2 \cdot L_i + w_3 \cdot R_i}{\text{officers\_required}_i}$$
  Where:
  - $x_i$: Number of officers deployed to hotspot $i$ (integer decision variable).
  - $C_i$: Predicted commuter time savings (hours).
  - $L_i$: Flipkart Logistics Penalty Index (LPI).
  - $R_i$: Predicted traffic violation risk.
  - $w_1, w_2, w_3$: Sliders-based weights (summing to $1.0$).
- **Constraints:**
  - **Global Patrol Budget:** $\sum_{i} x_i \le \text{total\_available\_officers}$
  - **Individual Hotspot Capacities:** $0 \le x_i \le \min(\text{officers\_required}_i, \text{max\_officers\_per\_hotspot})$
  - **Station Bounds:** $\sum_{i \in \text{Station}_k} x_i \le \text{station\_limit}_k$ for each local police jurisdiction $k$.

### File & Method References
- [dispatcher.py](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/backend/src/dispatcher.py):
  - `solve_dispatch_ilp()`: Formulates structural constraint matrices and executes `scipy.optimize.milp`.
- [optimizer.tsx](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/frontend/src/routes/optimizer.tsx):
  - Renders sliders for solver parameters (Patrol Force size, weights) and calls the simulation route to visualize the counterfactual "Before vs. After" road network outcomes side by side.

---

## 6. Greenshields Macroscopic Flow & Shockwave Simulator

### Core Functionality
Evaluates the physical traffic congestion impact of our dispatch choices. Translates forecasted violation risks into capacity bottlenecks and simulates counterfactual traffic flows to calculate delays.

### Core Models & Math
- **Road Capacity Reduction Factor (RCF):** Snapped slopes increase capacity bottlenecks for heavy vehicles:
  $$\text{RCF}_i = \min(0.50, \text{Risk}_i \cdot \text{constriction\_coef} + 1.5 \cdot |\text{Slope}_i|)$$
- **Greenshields Speed-Density Model:** Relates vehicular speed $v$ and density $\rho$:
  $$v = v_{\text{free}} \left(1 - \frac{\rho}{\rho_{\text{jam}} \cdot (1 - \text{RCF})}\right)$$
- **Officer Mitigation Decay:** Deployed officers reduce bottleneck risks exponentially:
  $$\text{Risk}_{\text{updated}} = \text{Risk} \cdot e^{-0.25 \cdot x_i}$$
- **Counterfactual Queuing Solver:** Simulates bottleneck shockwaves. If demand flow rate $q_{\text{demand}}$ exceeds updated capacity $C_{\text{new}} = C_{\text{base}} \cdot (1 - \text{RCF}_{\text{updated}})$, queuing delays are resolved via:
  $$\text{Delay}_i = \frac{q_{\text{demand}} - C_{\text{new}}}{2 \cdot C_{\text{new}}} \cdot 60 \text{ minutes}$$

### File & Method References
- [recommendation_engine.py](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/backend/src/recommendation_engine.py):
  - `simulate_traffic_flow()`: Runs the Greenshields macroscopic shockwave queue solver.
- [api.simulate.ts](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/frontend/src/routes/api.simulate.ts):
  - Handles simulation HTTP POST calls from the frontend to recalculate metrics.

---

## 7. Flipkart Supply Chain Logistics Optimization

### Core Functionality
Integrates e-commerce supply chains with municipal traffic planning. Tracks logistics hubs, scores corridor bottlenecks on logistics penalty indexes (LPI), and quantifies Flipkart delivery performance.

### Core Models & Math
- **Flipkart Logistics Penalty Index ($LPI$):** Scales road bottlenecks by a logistics importance factor ($\Lambda_i \in [1.0, 3.0]$) representing key delivery routes:
  $$LPI_i = \text{RCF}_i \times \Lambda_i$$
- **Flipkart Supply KPIs:** Computes e-commerce SLA breaches avoided and financial cost savings:
  $$\text{SLA Breaches Avoided}_i = \text{violations\_mitigated}_i \times 4.5$$
  $$\text{Savings (INR)}_i = \text{SLA Breaches Avoided}_i \times 1200$$

### File & Method References
- [logistics.tsx](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/frontend/src/routes/logistics.tsx):
  - Displays metrics for Flipkart routes, snapped hubs performance, and SLA projections.
- [api.data.ts](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/frontend/src/routes/api.data.ts):
  - Serves static coordinates for Flipkart logistics hubs, routes, and LPI weights.

---

## 8. AI Traffic Commander Copilot

### Core Functionality
Provides a floating chat interface that acts as an AI traffic assistant. Users can ask questions about telemetry, hotspots, or dispatch allocations. The copilot reads the live database dump and answers queries.

### Tech Stack
- **Large Language Model API:** Interfaced with Llama-3.3-70b-versatile models on Groq via Server-Sent Events (SSE).
- **Spatial Context Injection:** Injects active coordinates and telemetry stats into the prompt context.

### File & Method References
- [copilot.tsx](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/frontend/src/routes/copilot.tsx):
  - Renders the Copilot interface and telemetry graphs.
- [api.copilot.ts](file:///c:/Users/anujs/OneDrive/Desktop/GridLock%20Phase%202/frontend/src/routes/api.copilot.ts):
  - Establishes connection to the Groq LLM API and handles chat prompt streaming.
