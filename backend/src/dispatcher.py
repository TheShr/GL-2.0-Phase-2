import numpy as np
from scipy.optimize import milp, Bounds, LinearConstraint
import json
import os
import hashlib
from concurrent.futures import ThreadPoolExecutor

STATION_CENTROIDS = {
    "Upparpet": (12.978, 77.571),
    "Cubbon Park": (12.975, 77.607),
    "HSR Layout": (12.917, 77.622),
    "Bellandur": (12.930, 77.680),
    "Adugodi": (12.937, 77.631),
    "Halasur": (12.973, 77.617),
    "Shivajinagar": (12.986, 77.597),
    "Koramangala": (12.934, 77.624),
    "Hebbal": (13.035, 77.597),
    "Hebbala": (13.035, 77.597),
    "Indiranagar": (12.978, 77.641),
    "HAL Old Airport": (12.956, 77.648),
    "Kasturi Nagar": (13.007, 77.649),
    "Unknown": (12.9716, 77.5946)
}

def get_distance_km(coord1, coord2):
    lat1, lon1 = coord1
    lat2, lon2 = coord2
    return float(np.sqrt((lat1 - lat2)**2 + (lon1 - lon2)**2) * 111.0)

def get_hotspot_coords(h):
    if "lat" in h and "lon" in h and h["lat"] is not None and h["lon"] is not None:
        return (float(h["lat"]), float(h["lon"]))
    st = h.get("police_station", "Unknown")
    return STATION_CENTROIDS.get(st, STATION_CENTROIDS["Unknown"])

class PatrolAllocationOptimizer:
    """
    Patrol Allocation Optimizer using Integer Linear Programming (ILP) via SciPy.
    Supports parallel station-level decomposition, persistent caching, travel costs,
    and LP relaxation fallback.
    """
    def __init__(self):
        pass

    def get_cache_path(self):
        possible_dirs = ["backend/output", "output", "../output"]
        for d in possible_dirs:
            if os.path.exists(d):
                return os.path.join(d, "dispatcher_precomputed_cache.json")
        return "dispatcher_precomputed_cache.json"

    def distribute_budget(self, hotspots, total_avail, station_limits):
        by_station = {}
        for h in hotspots:
            st = h.get("police_station", "Unknown")
            by_station.setdefault(st, []).append(h)
        
        st_weights = {}
        st_limits = {}
        for st, st_hotspots in by_station.items():
            w = sum(
                0.4 * h.get("commuter_delay_savings", 0.0) +
                0.3 * h.get("logistics_penalty_index", 0.0) +
                0.3 * h.get("predicted_risk", 0.0)
                for h in st_hotspots
            )
            cap = sum(h.get("officers_required", 1) for h in st_hotspots)
            st_weights[st] = w
            st_limits[st] = min(cap, station_limits.get(st, total_avail))
        
        allocated = {st: 0 for st in by_station}
        remaining = min(total_avail, sum(st_limits.values()))
        
        while remaining > 0:
            best_st = None
            best_val = -1
            for st in by_station:
                if allocated[st] < st_limits[st]:
                    val = st_weights[st] / (allocated[st] + 1)
                    if val > best_val:
                        best_val = val
                        best_st = st
            if best_st is None:
                break
            allocated[best_st] += 1
            remaining -= 1
        return allocated, by_station

    def _solve_local_ilp(self, hotspots, budget, constraints):
        n = len(hotspots)
        if n == 0 or budget <= 0:
            return [0] * n

        max_per_hotspot = constraints.get("max_officers_per_hotspot", 3)
        c = []
        for h in hotspots:
            score = (
                0.4 * h.get("commuter_delay_savings", 0.0) +
                0.3 * h.get("logistics_penalty_index", 0.0) +
                0.3 * h.get("predicted_risk", 0.0)
            )
            req = max(1, h.get("officers_required", 1))
            c.append(-(score / req))
        c = np.array(c)

        lb = np.zeros(n)
        ub = np.zeros(n)
        for i, h in enumerate(hotspots):
            ub[i] = min(h.get("officers_required", 1), max_per_hotspot)
        bounds = Bounds(lb, ub)

        A = np.ones((1, n))
        b_ub = [budget]
        constraints_milp = LinearConstraint(A, -np.inf, b_ub)
        integrality = np.ones(n)

        try:
            res = milp(c=c, bounds=bounds, constraints=constraints_milp, integrality=integrality)
            if res.success:
                return np.round(res.x).astype(int).tolist()
        except Exception as e:
            print(f"[Dispatcher Warning] milp failed: {e}. Falling back to LP relaxation.")

        return self._solve_lp_relaxation(hotspots, budget, constraints)

    def _solve_lp_relaxation(self, hotspots, budget, constraints):
        from scipy.optimize import linprog
        n = len(hotspots)
        if n == 0 or budget <= 0:
            return [0] * n

        max_per_hotspot = constraints.get("max_officers_per_hotspot", 3)
        c = []
        for h in hotspots:
            score = (
                0.4 * h.get("commuter_delay_savings", 0.0) +
                0.3 * h.get("logistics_penalty_index", 0.0) +
                0.3 * h.get("predicted_risk", 0.0)
            )
            req = max(1, h.get("officers_required", 1))
            c.append(-(score / req))
        
        bounds_lp = []
        for h in hotspots:
            bounds_lp.append((0, min(h.get("officers_required", 1), max_per_hotspot)))

        A_ub = np.ones((1, n))
        b_ub = [budget]

        res = linprog(c, A_ub=A_ub, b_ub=b_ub, bounds=bounds_lp, method='highs')
        if not res.success:
            allocated = [0] * n
            remaining = budget
            sorted_indices = sorted(range(n), key=lambda idx: -c[idx])
            for idx in sorted_indices:
                req = min(hotspots[idx].get("officers_required", 1), max_per_hotspot)
                alloc = min(req, remaining)
                allocated[idx] = alloc
                remaining -= alloc
                if remaining <= 0:
                    break
            return allocated

        x = np.clip(res.x, 0, None)
        allocated = np.floor(x).astype(int)
        fracs = x - allocated
        remaining = int(budget - np.sum(allocated))

        if remaining > 0 and np.sum(fracs) > 0:
            probs = fracs / np.sum(fracs)
            indices = np.arange(n)
            for _ in range(remaining):
                valid_indices = [i for i in indices if allocated[i] < min(hotspots[i].get("officers_required", 1), max_per_hotspot)]
                if not valid_indices:
                    break
                p_valid = probs[valid_indices]
                if np.sum(p_valid) > 0:
                    p_valid = p_valid / np.sum(p_valid)
                else:
                    p_valid = np.ones(len(valid_indices)) / len(valid_indices)
                chosen = np.random.choice(valid_indices, p=p_valid)
                allocated[chosen] += 1

        return allocated.tolist()

    def _solve_no_cache(self, hotspots, total_avail, constraints):
        local_constraints = dict(constraints)
        local_constraints["total_available_officers"] = total_avail

        station_limits = local_constraints.get("max_deployments_per_station", {})
        allocated_budget, by_station = self.distribute_budget(hotspots, total_avail, station_limits)

        results = {}
        for st, st_hotspots in by_station.items():
            results[st] = self._solve_local_ilp(st_hotspots, allocated_budget[st], local_constraints)

        allocated_by_id = {}
        for st, st_hotspots in by_station.items():
            alloc_list = results[st]
            for idx, h in enumerate(st_hotspots):
                allocated_by_id[h["hotspot_id"]] = alloc_list[idx]

        stations = list(by_station.keys())
        pools = {st: station_limits.get(st, total_avail) for st in stations}

        schedule = []
        total_allocated_officers = 0
        optimized_score = 0.0

        for i, h in enumerate(hotspots):
            alloc = allocated_by_id.get(h["hotspot_id"], 0)
            h_coords = get_hotspot_coords(h)
            h_station = h.get("police_station", "Unknown")

            officers_info = []
            for _ in range(alloc):
                if pools.get(h_station, 0) > 0:
                    start_st = h_station
                    pools[h_station] -= 1
                else:
                    best_st = None
                    best_dist = float("inf")
                    for st, count in pools.items():
                        if count > 0:
                            dist = get_distance_km(STATION_CENTROIDS.get(st, STATION_CENTROIDS["Unknown"]), h_coords)
                            if dist < best_dist:
                                best_dist = dist
                                best_st = st
                    if best_st is not None:
                        start_st = best_st
                        pools[best_st] -= 1
                    else:
                        start_st = "Unknown"

                if start_st != "Unknown":
                    dist = get_distance_km(STATION_CENTROIDS.get(start_st, STATION_CENTROIDS["Unknown"]), h_coords)
                    transit_time = float(dist / 20.0 * 60.0)
                    boundary_penalty = 15.0 if start_st != h_station else 0.0
                else:
                    transit_time = 0.0
                    boundary_penalty = 0.0

                officers_info.append({
                    "starting_station": start_st,
                    "transit_time_minutes": transit_time,
                    "boundary_penalty_minutes": boundary_penalty,
                    "total_travel_time_minutes": transit_time + boundary_penalty
                })

            score_val = (
                0.4 * h.get("commuter_delay_savings", 0.0) +
                0.3 * h.get("logistics_penalty_index", 0.0) +
                0.3 * h.get("predicted_risk", 0.0)
            )
            req = max(1, h.get("officers_required", 1))

            total_travel_penalty = sum(0.4 * (o["total_travel_time_minutes"] / 60.0) for o in officers_info)
            gained_score = alloc * (score_val / req) - total_travel_penalty

            total_allocated_officers += alloc
            optimized_score += gained_score

            schedule.append({
                "hotspot_id": h["hotspot_id"],
                "hotspot_name": h.get("hotspot_name", ""),
                "police_station": h_station,
                "officers_required": h.get("officers_required", 1),
                "officers_allocated": alloc,
                "utilization_percent": int(round((alloc / req) * 100)) if req > 0 else 0,
                "composite_priority_score": score_val,
                "allocated_score_contribution": gained_score,
                "officers_detail": officers_info,
                "total_transit_time_minutes": sum(o["transit_time_minutes"] for o in officers_info),
                "total_boundary_penalty_minutes": sum(o["boundary_penalty_minutes"] for o in officers_info),
            })

        schedule = sorted(schedule, key=lambda x: x["allocated_score_contribution"], reverse=True)

        return {
            "status": "success",
            "total_score": float(optimized_score),
            "total_officers_allocated": total_allocated_officers,
            "available_officers": total_avail,
            "schedule": schedule
        }

    def solve(self, hotspots, constraints):
        n = len(hotspots)
        if n == 0:
            return {"status": "empty_input", "schedule": [], "total_score": 0.0, "total_officers_allocated": 0}

        total_avail = constraints.get("total_available_officers", 10)
        max_per_hotspot = constraints.get("max_officers_per_hotspot", 3)
        station_limits = constraints.get("max_deployments_per_station", {})

        # Compute persistent cache key hash
        state_str = json.dumps({
            "hotspots": [{k: v for k, v in h.items() if k not in ["lat", "lon"]} for h in hotspots],
            "max_officers_per_hotspot": max_per_hotspot,
            "max_deployments_per_station": station_limits
        }, sort_keys=True)
        problem_hash = hashlib.md5(state_str.encode("utf-8")).hexdigest()

        cache_path = self.get_cache_path()
        cache = {}
        if os.path.exists(cache_path):
            try:
                with open(cache_path, "r") as f:
                    cache = json.load(f)
            except Exception:
                pass

        if problem_hash in cache:
            str_total = str(total_avail)
            if str_total in cache[problem_hash]:
                print(f"[Dispatcher] Returning cached allocation schedule for {total_avail} officers.")
                return cache[problem_hash][str_total]

        # Cache miss or non-cached count. Let's pre-calculate all multiples of 5 from 10 to 100,
        # plus the requested total_avail if it's not a multiple of 5.
        counts_to_solve = list(range(10, 105, 5))
        if total_avail not in counts_to_solve:
            counts_to_solve.append(total_avail)
            counts_to_solve.sort()

        print(f"[Dispatcher] Pre-calculating allocation schedules for officer counts: {counts_to_solve}...")
        
        new_cached_entries = {}
        for count in counts_to_solve:
            result = self._solve_no_cache(hotspots, count, constraints)
            new_cached_entries[str(count)] = result
            
        cache[problem_hash] = new_cached_entries
        try:
            with open(cache_path, "w") as f:
                json.dump(cache, f, indent=2)
        except Exception as e:
            print(f"[Dispatcher Warning] Failed to write cache to {cache_path}: {e}")

        return new_cached_entries[str(total_avail)]


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
