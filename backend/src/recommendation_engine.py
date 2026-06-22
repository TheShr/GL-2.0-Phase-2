import os
import pandas as pd
import numpy as np
import json

def get_road_profile(police_station):
    # Differentiate road layout parameters and base demand based on police station domains
    # Arterial Roads (Tech corridors / ring roads)
    if police_station in ['HAL Old Airport', 'Hebbala', 'High ground', 'Chikkajala', 'HSR Layout', 'Bellandur']:
        return {
            'road_class': 'Arterial Highway Corridor',
            'C_base': 4000.0,
            'q_demand': 3900.0,
            'road_importance': 1.5,
            'lanes': 3
        }
    # Secondary/Commercial Streets (Narrow business markets / downtown blocks)
    elif police_station in ['Upparpet', 'Shivajinagar', 'City Market', 'Malleshwaram', 'Vijayanagara', 'Rajajinagar', 'Kodigehalli', 'Magadi Road']:
        return {
            'road_class': 'Secondary Commercial Street',
            'C_base': 1600.0,
            'q_demand': 1550.0,
            'road_importance': 1.2,
            'lanes': 2
        }
    # Collector/Residential Streets (Suburb roads with lower flows)
    else:
        return {
            'road_class': 'Collector/Residential Corridor',
            'C_base': 1000.0,
            'q_demand': 950.0,
            'road_importance': 0.8,
            'lanes': 1
        }

def simulate_corridor_ctm(L_corridor, q_demand, C_base, rcf, lanes, duration_hours=0.5):
    """
    Simulates a corridor using the dynamic Cell Transmission Model (Daganzo formulation).
    Incorporates smoothed Greenshields speed-density transitions via sigmoid blending.
    """
    V_free = 40.0         # km/h free-flow speed
    w = 15.0              # km/h backward shockwave speed
    rho_jam_lane = 150.0  # jam density per lane (veh/km)
    rho_jam = rho_jam_lane * lanes
    
    dt_sec = 15.0
    dt = dt_sec / 3600.0  # hours
    L_cell = V_free * dt  # 0.1667 km
    
    num_cells = max(3, int(np.round(L_corridor / L_cell)))
    L_cell = L_corridor / num_cells
    
    # Solve Greenshields quadratic to get initial equilibrium density:
    # q_demand = V_free * rho * (1 - rho/rho_jam)
    coeff_c = (q_demand * rho_jam) / V_free
    discriminant = (rho_jam ** 2) - (4.0 * coeff_c)
    if discriminant >= 0:
        rho_init = (rho_jam - np.sqrt(discriminant)) / 2.0
    else:
        rho_init = rho_jam / 2.0
        
    densities = np.full(num_cells, rho_init)
    
    # Capacity bottleneck cell in the middle of segment
    hotspot_cell = num_cells // 2
    cell_capacities = np.full(num_cells, C_base)
    cell_capacities[hotspot_cell] = C_base * (1.0 - rcf)
    
    def get_sending_receiving(rho, cell_cap):
        rho_crit = rho_jam / 2.0
        # Sigmoid blending around critical density to smooth transition
        weight = 1.0 / (1.0 + np.exp(0.15 * (rho - rho_crit)))
        
        q_free = V_free * rho * (1.0 - rho / rho_jam) if rho_jam > 0 else 0.0
        q_cong = w * (rho_jam - rho) if rho_jam > 0 else 0.0
        q_smooth = weight * q_free + (1.0 - weight) * q_cong
        
        # S: Sending capability (limited by flow capacity and available vehicles)
        S = min(cell_cap * dt, q_smooth * dt) if rho <= rho_crit else cell_cap * dt
        # R: Receiving capability (limited by flow capacity and available spaces)
        R = min(cell_cap * dt, q_smooth * dt) if rho > rho_crit else cell_cap * dt
        return S, R
        
    num_steps = int(np.round(duration_hours / dt))
    total_vehicles_in_system = 0.0
    
    for step in range(num_steps):
        S, R = [], []
        for i in range(num_cells):
            s, r = get_sending_receiving(densities[i], cell_capacities[i])
            S.append(s)
            R.append(r)
            
        Q = np.zeros(num_cells + 1)
        # Input boundary
        Q[0] = min(q_demand * dt, R[0])
        # Cell-to-cell flows
        for i in range(1, num_cells):
            Q[i] = min(S[i-1], R[i])
        # Output boundary
        Q[num_cells] = S[num_cells-1]
        
        # Density updates
        for i in range(num_cells):
            delta_n = Q[i] - Q[i+1]
            densities[i] += delta_n / L_cell
            densities[i] = max(0.0, min(rho_jam, densities[i]))
            
        total_vehicles_in_system += np.sum(densities * L_cell)
        
    avg_veh = total_vehicles_in_system / num_steps
    avg_travel_time_hours = avg_veh / q_demand if q_demand > 0 else L_corridor / V_free
    return avg_travel_time_hours * 60.0

def generate_enforcement_recommendations(clusters_csv_path, output_dir="output"):
    print("Loading hotspots for recommendation engine analysis...")
    df = pd.read_csv(clusters_csv_path)
    
    # Load parameters from constants.json if available
    commuter_delay_threshold = 1500.0
    logistics_penalty_threshold = 0.45
    constriction_coef_default = 0.3
    
    possible_paths = [
        os.path.join(output_dir, "constants.json"),
        os.path.join("output", "constants.json"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "output", "constants.json")
    ]
    for p in possible_paths:
        if os.path.exists(p):
            try:
                with open(p, "r") as f:
                    constants_data = json.load(f)
                    commuter_delay_threshold = constants_data.get("commuter_delay_savings_threshold", 1500.0)
                    logistics_penalty_threshold = constants_data.get("logistics_penalty_threshold", 0.45)
                    constriction_coef_default = constants_data.get("constriction_coef", 0.3)
                    print(f"Loaded constants from {p}: delay_thresh={commuter_delay_threshold}, log_thresh={logistics_penalty_threshold}, constr={constriction_coef_default}")
                    break
            except Exception as e:
                print(f"Error loading constants from {p}: {e}")

    # Initialize Mappls Service
    from mappls_service import MapplsService
    mappls = MapplsService()
    
    # Traffic Physics Parameters (Greenshields Model)
    V_free = 40.0         # Free-flow speed in km/h
    rho_jam_lane = 150.0   # Jam density per lane (vehicles/km)
    
    recommendations = []
    
    for idx, row in df.iterrows():
        station = row['primary_police_station']
        profile = get_road_profile(station)
        
        C_base = profile['C_base']
        q_demand = profile['q_demand']
        # Read OSM-snapped attributes from cluster CSV if available, else default to station profile
        lanes = int(row['lanes']) if 'lanes' in df.columns else profile['lanes']
        road_class = row['road_name'] if 'road_name' in df.columns else profile['road_class']
        road_importance = profile['road_importance']
        
        rho_jam = rho_jam_lane * lanes
        
        # 1. Calculate travel time under normal conditions (no violations)
        # Use Cell Transmission Model (CTM) simulation for normal conditions (rcf = 0)
        t_normal = simulate_corridor_ctm(L_corridor=1.0, q_demand=q_demand, C_base=C_base, rcf=0.0, lanes=lanes)
        
        # 2. Physics Layer Mapping: Risk -> Capacity Loss (RCF)
        # Use forecasted risk index from GNN/XGBoost hybrid if available, else fallback to historical counts
        predicted_risk = row['predicted_risk'] if 'predicted_risk' in df.columns else min(1.0, row['total_violations'] / 45000.0)
        
        # Segment-specific physical constriction coefficient (mean size footprint scaled by lanes)
        constriction_coef = (row['total_capacity_loss'] / row['total_violations']) / lanes if row['total_violations'] > 0 else constriction_coef_default
        
        # Physics capacity choke factor calculation with road slope penalty:
        slope = float(row['slope']) if 'slope' in df.columns else 0.0
        slope_penalty = 1.5 * abs(slope)
        rcf = min(0.50, predicted_risk * constriction_coef + slope_penalty)
        C_congested = C_base * (1.0 - rcf)
        
        # 3. Congestion Delay Calculations using dynamic CTM
        t_congested_total = simulate_corridor_ctm(L_corridor=1.0, q_demand=q_demand, C_base=C_base, rcf=rcf, lanes=lanes)
        
        # 4. priority calculation
        delay_savings_per_vehicle = max(0.0, t_congested_total - t_normal)
        total_delay_savings_hours = (delay_savings_per_vehicle / 60.0) * q_demand
        
        # 3.5 Flipkart Logistics Penalty Index (LPI) Formulation
        # Higher weights for primary corridors connecting Whitefield, Electronic City, Koramangala, Hebbal
        if station in ['HAL Old Airport', 'Bellandur', 'HSR Layout', 'Hebbala', 'Upparpet']:
            lambda_i = 3.0  # Key arterial/commercial logistics corridors
        elif station in ['Shivajinagar', 'City Market', 'Malleshwaram', 'Vijayanagara']:
            lambda_i = 1.8  # Moderate-to-high logistics routes
        else:
            lambda_i = 1.0  # Residential and local collector streets
            
        # Try fetching real-world traffic delay from Mappls Route ETA API
        live_delay_min = None
        route_name = None
        station_lower = station.lower()
        if 'old airport' in station_lower or 'airport' in station_lower or 'bellandur' in station_lower:
            route_name = 'Whitefield'
        elif 'hsr' in station_lower or 'electronic' in station_lower:
            route_name = 'Electronic City'
        elif 'koramangala' in station_lower or 'sarjapur' in station_lower:
            route_name = 'Koramangala'
        elif 'hebbal' in station_lower:
            route_name = 'Hebbal'

        if route_name and route_name in mappls.FLIPKART_ROUTES:
            route_info = mappls.FLIPKART_ROUTES[route_name]
            try:
                start_lat, start_lon = route_info['start']
                end_lat, end_lon = route_info['end']
                
                # Compare traffic-enabled ETA vs non-traffic ADV ETA
                eta_traffic = mappls.get_route_eta(start_lat, start_lon, end_lat, end_lon, traffic=True)
                eta_freeflow = mappls.get_route_eta(start_lat, start_lon, end_lat, end_lon, traffic=False)
                
                dur_traffic = eta_traffic.get("duration", 0.0) if eta_traffic else 0.0
                dur_freeflow = eta_freeflow.get("duration", 0.0) if eta_freeflow else 0.0
                
                live_delay_min = max(0.0, (dur_traffic - dur_freeflow) / 60.0)
                print(f"[Mappls Route ETA] Successfully computed live delay of {live_delay_min:.2f} mins for {route_name} Corridor.")
            except Exception as e:
                print(f"[Mappls Route ETA Warning] Route ETA failed: {e}. Falling back to Distance Matrix.")

        if live_delay_min is None:
            try:
                live_delay_min = mappls.get_route_delay_for_station(station)
            except Exception as e:
                print(f"[Mappls Warning] Distance Matrix call failed or rate-limited for {station}: {e}. Falling back to Greenshields CTM equations.")
            
        if live_delay_min is not None:
            delay_savings_per_vehicle = live_delay_min
            total_delay_savings_hours = (delay_savings_per_vehicle / 60.0) * q_demand
            lpi_rcf = min(0.45, (live_delay_min / 30.0) * 0.45)
            lpi = lpi_rcf * lambda_i
            print(f"[Mappls Integration] Updated live delay: {live_delay_min:.2f} mins. LPI set to {lpi:.3f}.")
        else:
            lpi = rcf * lambda_i
        
        # 4. Multi-factor priority score calculation including Logistics Penalty Index (LPI)
        # Weighting: 40% travel delay savings, 30% logistics impact (LPI), 30% risk volume
        delay_component = min(1.0, total_delay_savings_hours / commuter_delay_threshold) * 40.0
        logistics_component = min(1.0, lpi / logistics_penalty_threshold) * 30.0
        risk_component = predicted_risk * 30.0
        
        priority_score = delay_component + logistics_component + risk_component
        
        # Determine target shift based on typical hotspots
        if station in ['Upparpet', 'Shivajinagar', 'City Market', 'Halasuru Gate']:
            target_shift = "Morning Rush (08:00 - 12:00 IST)"
            enforce_action = "Tow trucks + double-parking citations"
        else:
            target_shift = "Night/Early Morning Patrol (04:00 - 08:00 IST)"
            enforce_action = "Wheel clamping + lane clearance"

        recommendations.append({
            'cluster_id': int(row['cluster_id']),
            'police_station': station,
            'road_class': road_class,
            'lanes': lanes,
            'location_centroid': f"({row['centroid_lat']:.4f}, {row['centroid_lon']:.4f})",
            'lat': float(row['centroid_lat']),
            'lon': float(row['centroid_lon']),
            'predicted_risk_index': predicted_risk,
            'capacity_reduction_rcf': rcf,
            'logistics_weight': lambda_i,
            'logistics_penalty_index': lpi,
            'travel_time_before_min_km': t_congested_total,
            'travel_time_after_min_km': t_normal,
            'delay_savings_per_vehicle_min': delay_savings_per_vehicle,
            'total_commuter_time_saved_hours': total_delay_savings_hours,
            'priority_score': priority_score,
            'target_shift': target_shift,
            'enforcement_action': enforce_action,
            'vulnerability_index': float(row['vulnerability_index']) if 'vulnerability_index' in df.columns else 1.0,
            'slope': float(row['slope']) if 'slope' in df.columns else 0.0,
            'commercial_density': float(row['commercial_density']) if 'commercial_density' in df.columns else 0.0,
            'transit_density': float(row['transit_density']) if 'transit_density' in df.columns else 0.0,
            'dining_density': float(row['dining_density']) if 'dining_density' in df.columns else 0.0,
            'corporate_density': float(row['corporate_density']) if 'corporate_density' in df.columns else 0.0,
            'elevation': float(row['elevation']) if 'elevation' in df.columns else 900.0,
        })

    recs_df = pd.DataFrame(recommendations)
    
    # Run Integer Linear Programming (ILP) Solver for Optimal Patrol Dispatch
    try:
        from dispatcher import PatrolAllocationOptimizer
        optimizer = PatrolAllocationOptimizer()
        
        # Format input hotspots for ILP
        ilp_hotspots = []
        for idx, r in recs_df.iterrows():
            # Estimate officers required based on road class importance/lanes
            req = 3 if r['logistics_weight'] >= 3.0 else (2 if r['logistics_weight'] >= 1.8 else 1)
            ilp_hotspots.append({
                "hotspot_id": int(r['cluster_id']),
                "hotspot_name": r['road_class'],
                "predicted_risk": float(r['predicted_risk_index']),
                "commuter_delay_savings": float(r['total_commuter_time_saved_hours']),
                "logistics_penalty_index": float(r['logistics_penalty_index']),
                "officers_required": req,
                "police_station": r['police_station']
            })
            
        constraints = {
            "total_available_officers": 15,
            "max_officers_per_hotspot": 3,
            "max_deployments_per_station": {
                "HSR Layout": 4,
                "HAL Old Airport": 3,
                "Bellandur": 3,
                "Hebbala": 3,
                "Koramangala": 3,
                "Upparpet": 3,
                "Shivajinagar": 3
            }
        }
        
        result = optimizer.solve(ilp_hotspots, constraints)
        if result["status"] == "success":
            # Map solver allocations back to dataframe
            alloc_map = {item["hotspot_id"]: item["officers_allocated"] for item in result["schedule"]}
            recs_df["officers_allocated"] = recs_df["cluster_id"].map(alloc_map).fillna(0).astype(int)
            # Sort by officers allocated (descending) first, then priority score (descending)
            recs_df = recs_df.sort_values(by=["officers_allocated", "priority_score"], ascending=[False, False]).reset_index(drop=True)
            print(f"ILP Patrol Allocation solved successfully. Allocated {result['total_officers_allocated']} officers across critical hotspots.")
        else:
            recs_df["officers_allocated"] = 0
            recs_df = recs_df.sort_values(by="priority_score", ascending=False).reset_index(drop=True)
    except Exception as e:
        print(f"ILP Solver fallback to Greedy sorting due to: {e}")
        recs_df["officers_allocated"] = 0
        recs_df = recs_df.sort_values(by="priority_score", ascending=False).reset_index(drop=True)

    recs_df['rank'] = recs_df.index + 1
    
    # Task 2.2: Look up nearest local landmarks via reverse geocoding for top 10 hotspots
    print("\n--- Performing Reverse Geocoding for Top 10 Hotspots ---")
    nearest_landmarks = []
    for idx, row in recs_df.iterrows():
        rank = int(row['rank'])
        if rank <= 10:
            lat = float(row['lat'])
            lon = float(row['lon'])
            try:
                landmark = mappls.reverse_geocode(lat, lon)
            except Exception as e:
                print(f"[Mappls Warning] Reverse geocode failed: {e}")
                landmark = f"Near coordinates ({lat:.4f}, {lon:.4f})"
            nearest_landmarks.append(landmark)
            print(f"Rank {rank}: Centroid ({lat:.4f}, {lon:.4f}) -> {landmark}")
        else:
            nearest_landmarks.append(f"Near coordinates ({row['lat']:.4f}, {row['lon']:.4f})")
            
    recs_df['nearest_landmark'] = nearest_landmarks

    # 5. Output recommendations report
    os.makedirs(output_dir, exist_ok=True)
    recs_df.to_csv(f"{output_dir}/enforcement_schedule.csv", index=False)
    
    # Categorize into Tiers
    tier_1 = recs_df[recs_df['priority_score'] >= 15.0]
    tier_2 = recs_df[(recs_df['priority_score'] < 15.0) & (recs_df['priority_score'] >= 3.0)]
    tier_3 = recs_df[recs_df['priority_score'] < 3.0]
    
    report = []
    report.append("=========================================================================")
    report.append("                      ATLAS TIERED ENFORCEMENT DISPATCH SCHEDULE")
    report.append("=========================================================================\n")
    report.append(f"Analyzing {len(recs_df)} high-density illegal parking hotspots in Bengaluru.")
    report.append("Traffic Simulation Baseline: Greenshields Speed-Density CTM Pipeline\n")
    
    def format_tier_section(tier_df, tier_title):
        section = []
        section.append(f"=== {tier_title} (Count: {len(tier_df)}) ===")
        section.append("-" * 73)
        if tier_df.empty:
            section.append("  No hotspots fall under this tier.")
            section.append("-" * 73)
            return section
            
        for _, r in tier_df.head(10).iterrows():
            section.append(f"RANK {int(r['rank'])}: Cluster {int(r['cluster_id'])} | {r['police_station']} Police Station")
            section.append(f"  Centroid Coordinates    : {r['location_centroid']}")
            if 'nearest_landmark' in r:
                section.append(f"  Nearest Landmark        : {r['nearest_landmark']}")
            section.append(f"  Road Classification     : {r['road_class']} ({int(r['lanes'])} lanes)")
            section.append(f"  Predicted GNN Risk Index: ~{r['predicted_risk_index']:.2f}")
            section.append(f"  Priority Index Score    : ~{r['priority_score']:.1f}/100")
            section.append(f"  Estimated Capacity Loss : ~{int(np.round(r['capacity_reduction_rcf']*100))}% (road choke factor)")
            section.append(f"  Travel Time status quo  : ~{int(np.round(r['travel_time_before_min_km']))} min per km (incl. queuing)")
            section.append(f"  Travel Time optimized   : ~{int(np.round(r['travel_time_after_min_km']))} min per km")
            section.append(f"  Commuter Delay Savings  : ~{int(np.round(r['delay_savings_per_vehicle_min']))} min saved per vehicle")
            section.append(f"  System Impact / Hour    : ~{int(np.round(r['total_commuter_time_saved_hours']/10)*10)} hours saved")
            section.append(f"  Recommended Dispatch    : {r['target_shift']}")
            section.append(f"  Tactical Action Plan    : {r['enforcement_action']}")
            section.append("-" * 73)
        return section
        
    report.extend(format_tier_section(tier_1, "TIER 1 - CRITICAL ENFORCEMENT ZONES"))
    report.append("\n")
    report.extend(format_tier_section(tier_2, "TIER 2 - MODERATE ACTION ZONES"))
    report.append("\n")
    report.extend(format_tier_section(tier_3, "TIER 3 - MONITOR & REPORT ZONES"))
    
    report_text = "\n".join(report)
    with open(f"{output_dir}/enforcement_recommendations.txt", "w", encoding="utf-8") as f:
        f.write(report_text)
        
    # Task 3: Accelerated Telemetry Export
    # Save/append updated data to backend/output/telemetry_dump.json under root key "0"
    print("\n--- Compiling and Exporting Real-World Telemetry to telemetry_dump.json ---")
    
    # Calculate flipkart impact details
    hotspots_json = []
    total_violations_val = int(df['total_violations'].sum()) if 'total_violations' in df.columns else 236126
    
    for _, r in recs_df.iterrows():
        total_saved = float(r['total_commuter_time_saved_hours'])
        lw = float(r['logistics_weight'])
        
        # Calculate flipkart impact
        sla_breaches = int(np.round(total_saved * 1.4 * lw))
        cost_savings = float(sla_breaches * 250.0)
        
        station_name = str(r['police_station'])
        
        # Upstream links representing ST-GAT queue propagation segments leading to hotspot
        upstream_map = {
            "Upparpet": [
                [{"lat": 12.978, "lng": 77.571}, {"lat": 12.975, "lng": 77.607}],
                [{"lat": 12.965, "lng": 77.576}, {"lat": 12.978, "lng": 77.571}]
            ],
            "Cubbon Park": [
                [{"lat": 12.975, "lng": 77.607}, {"lat": 12.972, "lng": 77.595}],
                [{"lat": 12.972, "lng": 77.595}, {"lat": 12.970, "lng": 77.591}]
            ],
            "HSR Layout": [
                [{"lat": 12.917, "lng": 77.622}, {"lat": 12.910, "lng": 77.641}],
                [{"lat": 12.910, "lng": 77.641}, {"lat": 12.898, "lng": 77.630}]
            ],
            "Bellandur": [
                [{"lat": 12.930, "lng": 77.680}, {"lat": 12.914, "lng": 77.678}],
                [{"lat": 12.920, "lng": 77.670}, {"lat": 12.930, "lng": 77.680}]
            ],
            "Adugodi": [
                [{"lat": 12.937, "lng": 77.631}, {"lat": 12.934, "lng": 77.624}],
                [{"lat": 12.962, "lng": 77.638}, {"lat": 12.934, "lng": 77.626}]
            ],
            "Halasur": [
                [{"lat": 12.973, "lng": 77.617}, {"lat": 12.974, "lng": 77.620}],
                [{"lat": 12.977, "lng": 77.625}, {"lat": 12.974, "lng": 77.620}]
            ]
        }
        
        hotspots_json.append({
            "rank": int(r['rank']),
            "cluster_id": int(r['cluster_id']),
            "police_station": station_name,
            "road_class": str(r['road_class']),
            "lanes": int(r['lanes']),
            "lat": float(r['lat']),
            "lon": float(r['lon']),
            "predicted_risk_index": float(r['predicted_risk_index']),
            "capacity_reduction_rcf": float(r['capacity_reduction_rcf']),
            "logistics_weight": float(r['logistics_weight']),
            "logistics_penalty_index": float(r['logistics_penalty_index']),
            "travel_time_before": f"{float(r['travel_time_before_min_km']):.1f}",
            "travel_time_after": f"{float(r['travel_time_after_min_km']):.1f}",
            "delay_savings_per_vehicle": f"{float(r['delay_savings_per_vehicle_min']):.1f}",
            "total_commuter_time_saved_hours": float(r['total_commuter_time_saved_hours']),
            "priority_score": float(r['priority_score']),
            "target_shift": str(r['target_shift']),
            "enforcement_action": str(r['enforcement_action']),
            "nearest_landmark": str(r['nearest_landmark']),
            "directed_side": "left",
            "upstream_edges": upstream_map.get(station_name, []),
            "vulnerability_index": float(r['vulnerability_index']) if 'vulnerability_index' in recs_df.columns else 1.0,
            "slope": float(r['slope']) if 'slope' in recs_df.columns else 0.0,
            "commercial_density": float(r['commercial_density']) if 'commercial_density' in recs_df.columns else 0.0,
            "transit_density": float(r['transit_density']) if 'transit_density' in recs_df.columns else 0.0,
            "dining_density": float(r['dining_density']) if 'dining_density' in recs_df.columns else 0.0,
            "corporate_density": float(r['corporate_density']) if 'corporate_density' in recs_df.columns else 0.0,
            "elevation": float(r['elevation']) if 'elevation' in recs_df.columns else 900.0,
            "flipkart_impact": {
                "sla_breaches_avoided": sla_breaches,
                "cost_savings_inr": cost_savings
            }
        })
        
    total_sla_breaches = sum(h["flipkart_impact"]["sla_breaches_avoided"] for h in hotspots_json)
    total_cost_savings = sum(h["flipkart_impact"]["cost_savings_inr"] for h in hotspots_json)
    
    # Define Flipkart route coordinates directly in Python to export them into the compiled json
    routes_json = [
        {
            "name": "Whitefield Hub ➔ Koramangala Hub (Route 1)",
            "coords": [
                {"lat": 12.969, "lng": 77.750},
                {"lat": 12.990, "lng": 77.716},
                {"lat": 12.989, "lng": 77.696},
                {"lat": 12.956, "lng": 77.701},
                {"lat": 12.930, "lng": 77.680},
                {"lat": 12.920, "lng": 77.670},
                {"lat": 12.922, "lng": 77.649},
                {"lat": 12.934, "lng": 77.624}
            ],
            "color": "#F43F5E"
        },
        {
            "name": "Electronic City ➔ Majestic Hub (Route 2)",
            "coords": [
                {"lat": 12.845, "lng": 77.663},
                {"lat": 12.879, "lng": 77.644},
                {"lat": 12.863, "lng": 77.659},
                {"lat": 12.903, "lng": 77.624},
                {"lat": 12.917, "lng": 77.622},
                {"lat": 12.921, "lng": 77.618},
                {"lat": 12.943, "lng": 77.611},
                {"lat": 12.969, "lng": 77.588},
                {"lat": 12.978, "lng": 77.571}
            ],
            "color": "#D97706"
        },
        {
            "name": "Hebbal Hub ➔ Indiranagar Hub (Route 3)",
            "coords": [
                {"lat": 13.035, "lng": 77.597},
                {"lat": 13.024, "lng": 77.619},
                {"lat": 13.018, "lng": 77.643},
                {"lat": 13.007, "lng": 77.663},
                {"lat": 13.004, "lng": 77.675},
                {"lat": 12.978, "lng": 77.641}
            ],
            "color": "#2563EB"
        }
    ]

    telemetry_payload = {
        "0": {
            "summary": {
                "total_hotspots": len(recs_df),
                "total_violations": total_violations_val,
                "avg_capacity_recovered": int(np.round(recs_df['capacity_reduction_rcf'].mean() * 100)),
                "total_savings": int(np.round(recs_df['total_commuter_time_saved_hours'].sum())),
                "flipkart_impact": {
                    "sla_breaches_avoided": total_sla_breaches,
                    "cost_savings_inr": total_cost_savings
                }
            },
            "hotspots": hotspots_json,
            "routes": routes_json
        }
    }
    
    telemetry_path = os.path.join(output_dir, "telemetry_dump.json")
    with open(telemetry_path, "w") as f:
        json.dump(telemetry_payload, f, indent=2)
    print(f"Telemetry payload successfully written to: {telemetry_path}")
    
    print("Enforcement recommendation engine execution complete! Output written to: output/enforcement_recommendations.txt")
    return recs_df

if __name__ == "__main__":
    clusters_csv = "output/hotspot_clusters.csv"
    if os.path.exists(clusters_csv):
        generate_enforcement_recommendations(clusters_csv)
    else:
        print(f"Error: {clusters_csv} not found. Please run gis_layer.py first.")
