import numpy as np
from scipy.optimize import milp, Bounds, LinearConstraint
import json
import sys

class PatrolAllocationOptimizer:
    """
    Patrol Allocation Optimizer using Integer Linear Programming (ILP) via SciPy.
    Replaces the greedy allocation with a global constraint solver.
    """
    def __init__(self):
        pass

    def solve(self, hotspots, constraints):
        """
        Solves the Integer Linear Program.
        
        Parameters:
        - hotspots: list of dicts, each containing:
            - hotspot_id (int)
            - hotspot_name (str)
            - predicted_risk (float)
            - commuter_delay_savings (float)
            - logistics_penalty_index (float)
            - officers_required (int)
            - police_station (str)
        - constraints: dict containing:
            - total_available_officers (int)
            - max_officers_per_hotspot (int)
            - max_deployments_per_station (dict of station_name -> max_limit)
            
        Returns:
        - Dictionary containing solution metrics and allocation schedule.
        """
        n = len(hotspots)
        if n == 0:
            return {"status": "empty_input", "schedule": [], "total_score": 0.0, "total_officers_allocated": 0}

        total_avail = constraints.get("total_available_officers", 10)
        max_per_hotspot = constraints.get("max_officers_per_hotspot", 3)
        station_limits = constraints.get("max_deployments_per_station", {})

        # 1. Objective function coefficients (SciPy milp MINIMIZES, so we invert coefficients to maximize)
        # Cost function: c = - (0.4 * commuter_delay_savings + 0.3 * logistics_penalty_index + 0.3 * predicted_risk)
        # We divide by the number of officers required to get a 'utility density' per officer.
        c = []
        for h in hotspots:
            score = (
                0.4 * h.get("commuter_delay_savings", 0.0) +
                0.3 * h.get("logistics_penalty_index", 0.0) +
                0.3 * h.get("predicted_risk", 0.0)
            )
            # Avoid division by zero
            req = max(1, h.get("officers_required", 1))
            c.append(-(score / req))
            
        c = np.array(c)

        # 2. Variable Bounds
        # Lower bound: 0
        # Upper bound: min(officers_required, max_officers_per_hotspot)
        lb = np.zeros(n)
        ub = np.zeros(n)
        for i, h in enumerate(hotspots):
            ub[i] = min(h.get("officers_required", 1), max_per_hotspot)
            
        bounds = Bounds(lb, ub)

        # 3. Constraint Matrices: A @ x <= b
        A_rows = []
        b_ub = []

        # Constraint A: Global total officer limit
        # sum(x_i) <= total_available_officers
        global_row = np.ones(n)
        A_rows.append(global_row)
        b_ub.append(total_avail)

        # Constraint B: Police station level limits
        # Find unique stations
        stations = list(set(h.get("police_station", "Unknown") for h in hotspots))
        for station in stations:
            if station in station_limits:
                limit = station_limits[station]
                station_row = np.zeros(n)
                for i, h in enumerate(hotspots):
                    if h.get("police_station") == station:
                        station_row[i] = 1.0
                A_rows.append(station_row)
                b_ub.append(limit)

        A = np.vstack(A_rows)
        # SciPy milp constraints format: LinearConstraint(A, lb, ub)
        # Lower bounds are -inf since these are upper-bound limits (A @ x <= b)
        constraints_milp = LinearConstraint(A, -np.inf, b_ub)

        # 4. Integrality Vector (1 = Integer variable)
        integrality = np.ones(n)

        # 5. Solve using scipy.optimize.milp
        res = milp(c=c, bounds=bounds, constraints=constraints_milp, integrality=integrality)

        if res.success:
            allocated = np.round(res.x).astype(int)
            
            schedule = []
            total_allocated_officers = 0
            optimized_score = 0.0
            
            for i, h in enumerate(hotspots):
                alloc = int(allocated[i])
                score_val = (
                    0.4 * h.get("commuter_delay_savings", 0.0) +
                    0.3 * h.get("logistics_penalty_index", 0.0) +
                    0.3 * h.get("predicted_risk", 0.0)
                )
                req = max(1, h.get("officers_required", 1))
                gained_score = alloc * (score_val / req)
                
                total_allocated_officers += alloc
                optimized_score += gained_score

                schedule.append({
                    "hotspot_id": h.get("hotspot_id"),
                    "hotspot_name": h.get("hotspot_name"),
                    "police_station": h.get("police_station"),
                    "officers_required": h.get("officers_required"),
                    "officers_allocated": alloc,
                    "utilization_percent": int(round((alloc / req) * 100)) if req > 0 else 0,
                    "composite_priority_score": score_val,
                    "allocated_score_contribution": gained_score
                })

            # Sort schedule by allocated score contribution descending
            schedule = sorted(schedule, key=lambda x: x["allocated_score_contribution"], reverse=True)

            return {
                "status": "success",
                "total_score": float(optimized_score),
                "total_officers_allocated": total_allocated_officers,
                "available_officers": total_avail,
                "schedule": schedule
            }
        else:
            return {
                "status": "failure",
                "message": res.message,
                "schedule": [],
                "total_score": 0.0,
                "total_officers_allocated": 0
            }


if __name__ == "__main__":
    # Test Data Setup
    test_hotspots = [
        {
            "hotspot_id": 1,
            "hotspot_name": "Agara Circle Outer Ring Road",
            "predicted_risk": 0.95,
            "commuter_delay_savings": 1200.0,
            "logistics_penalty_index": 2.85,
            "officers_required": 3,
            "police_station": "HSR Layout"
        },
        {
            "hotspot_id": 2,
            "hotspot_name": "Marathahalli Bridge Old Airport Road",
            "predicted_risk": 0.88,
            "commuter_delay_savings": 950.0,
            "logistics_penalty_index": 2.64,
            "officers_required": 2,
            "police_station": "HAL Old Airport"
        },
        {
            "hotspot_id": 3,
            "hotspot_name": "Silk Board Junction",
            "predicted_risk": 0.98,
            "commuter_delay_savings": 1500.0,
            "logistics_penalty_index": 2.94,
            "officers_required": 4,
            "police_station": "HSR Layout"
        },
        {
            "hotspot_id": 4,
            "hotspot_name": "Tin Factory Intersection",
            "predicted_risk": 0.75,
            "commuter_delay_savings": 800.0,
            "logistics_penalty_index": 2.25,
            "officers_required": 2,
            "police_station": "Kasturi Nagar"
        },
        {
            "hotspot_id": 5,
            "hotspot_name": "Koramangala 80ft Road Commercial",
            "predicted_risk": 0.62,
            "commuter_delay_savings": 400.0,
            "logistics_penalty_index": 1.11,
            "officers_required": 2,
            "police_station": "Koramangala"
        }
    ]

    test_constraints = {
        "total_available_officers": 6,
        "max_officers_per_hotspot": 3,
        "max_deployments_per_station": {
            "HSR Layout": 4,
            "HAL Old Airport": 2,
            "Kasturi Nagar": 1,
            "Koramangala": 2
        }
    }

    # Run Solver
    optimizer = PatrolAllocationOptimizer()
    result = optimizer.solve(test_hotspots, test_constraints)

    # 1. Output Example JSON Input and Output
    print("=========================================================================")
    print("                     PATROL DISPATCH OPTIMIZER (ILP)")
    print("=========================================================================\n")
    
    print("--- EXAMPLE INPUT CONSTRAINTS JSON ---")
    print(json.dumps(test_constraints, indent=2))
    print("\n--- EXAMPLE OUTPUT SOLUTIONS JSON ---")
    print(json.dumps(result, indent=2))
    
    # 2. Evaluation metrics: Compare ILP against greedy approach
    # Greedy picks highest score first and allocates until constraints are hit
    def run_greedy(hotspots, constraints):
        total_avail = constraints["total_available_officers"]
        max_per_hotspot = constraints["max_officers_per_hotspot"]
        station_limits = dict(constraints["max_deployments_per_station"])
        
        # Calculate composite score
        scored_hotspots = []
        for h in hotspots:
            score = (
                0.4 * h["commuter_delay_savings"] +
                0.3 * h["logistics_penalty_index"] +
                0.3 * h["predicted_risk"]
            )
            scored_hotspots.append((score, h))
            
        # Sort by score descending
        scored_hotspots.sort(key=lambda x: x[0], reverse=True)
        
        allocated = {}
        total_allocated = 0
        greedy_score = 0.0
        
        for score, h in scored_hotspots:
            station = h["police_station"]
            needed = min(h["officers_required"], max_per_hotspot)
            
            # Check limits
            room_global = total_avail - total_allocated
            room_station = station_limits.get(station, total_avail)
            
            alloc = min(needed, room_global, room_station)
            
            if alloc > 0:
                allocated[h["hotspot_id"]] = alloc
                total_allocated += alloc
                greedy_score += alloc * (score / h["officers_required"])
                # update station limit
                if station in station_limits:
                    station_limits[station] -= alloc
                    
        return greedy_score, total_allocated

    greedy_score, greedy_allocated = run_greedy(test_hotspots, test_constraints)
    
    print("\n=========================================================================")
    print("                       OPTIMIZATION EVALUATION METRICS")
    print("=========================================================================")
    print(f"Integer Linear Program Score : {result['total_score']:.2f} (Allocated: {result['total_officers_allocated']} officers)")
    print(f"Greedy Allocation Score      : {greedy_score:.2f} (Allocated: {greedy_allocated} officers)")
    improvement = ((result['total_score'] - greedy_score) / (greedy_score or 1.0)) * 100.0
    print(f"Overall Allocation Gain      : +{improvement:.1f}%")
    print("=========================================================================")
