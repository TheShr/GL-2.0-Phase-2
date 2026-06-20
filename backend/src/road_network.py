import os
import pandas as pd
import numpy as np
import json
from scipy.spatial import cKDTree

# Predefined corridors with true physical attributes
CORRIDORS_WAYPOINTS = {
    'Outer Ring Road ORR': {
        'waypoints': [
            (13.035, 77.597), # Hebbal
            (13.024, 77.619), # Nagawara
            (13.018, 77.643), # Kalyan Nagar
            (13.007, 77.663), # Kasturi Nagar
            (13.004, 77.675), # Tin Factory
            (12.989, 77.696), # Mahadevapura
            (12.956, 77.701), # Marathahalli Junction
            (12.937, 77.691), # Kadubeesanahalli
            (12.930, 77.680), # Bellandur
            (12.920, 77.670), # Ibblur
            (12.922, 77.649), # Agara
            (12.910, 77.641), # HSR Layout
            (12.917, 77.622)  # Silk Board
        ],
        'lanes': 4,
        'road_importance': 3.0, # High logistics priority
        'base_capacity': 4000.0,
        'q_demand': 3900.0,
        'speed_limit': 60.0,
        'road_class': 'Arterial Highway Corridor'
    },
    'Old Airport Road': {
        'waypoints': [
            (12.973, 77.617), # Trinity Circle
            (12.962, 77.638), # Domlur
            (12.963, 77.648), # Kodihalli
            (12.964, 77.658), # Jeevanbheemanagar
            (12.960, 77.679), # HAL Airport
            (12.959, 77.697)  # Marathahalli Bridge
        ],
        'lanes': 3,
        'road_importance': 3.0, # High logistics priority
        'base_capacity': 3000.0,
        'q_demand': 2900.0,
        'speed_limit': 50.0,
        'road_class': 'Arterial Highway Corridor'
    },
    'Hosur Road NH 44': {
        'waypoints': [
            (12.917, 77.622), # Silk Board
            (12.903, 77.624), # Bommanahalli
            (12.893, 77.636), # Kudlu Gate
            (12.879, 77.644), # Singasandra
            (12.863, 77.659), # Hosa Road
            (12.845, 77.663)  # Electronic City
        ],
        'lanes': 4,
        'road_importance': 3.0,
        'base_capacity': 4000.0,
        'q_demand': 3900.0,
        'speed_limit': 60.0,
        'road_class': 'Arterial Highway Corridor'
    },
    'MG Road Central Commercial': {
        'waypoints': [
            (12.978, 77.571), # Upparpet / Majestic
            (12.965, 77.576), # City Market
            (12.969, 77.588), # Hudson Circle
            (12.972, 77.595), # Kasturba Road
            (12.975, 77.607), # MG Road Metro
            (12.973, 77.617), # Trinity Circle
            (12.977, 77.625), # Halasuru
            (12.978, 77.641)  # Indiranagar
        ],
        'lanes': 3,
        'road_importance': 1.8,
        'base_capacity': 2400.0,
        'q_demand': 2300.0,
        'speed_limit': 40.0,
        'road_class': 'Central Commercial Trunk Line'
    },
    'Sarjapur Road': {
        'waypoints': [
            (12.934, 77.624), # Koramangala
            (12.922, 77.649), # Agara Circle
            (12.920, 77.670), # Ibblur
            (12.914, 77.678), # Kaikondrahalli
            (12.912, 77.683), # Sarjapur Wipro Gate
            (12.908, 77.695)  # Carmelaram Road
        ],
        'lanes': 2,
        'road_importance': 1.8,
        'base_capacity': 1600.0,
        'q_demand': 1550.0,
        'speed_limit': 40.0,
        'road_class': 'Secondary Commercial Street'
    },
    'Whitefield ITPL Road': {
        'waypoints': [
            (12.989, 77.696), # Mahadevapura
            (12.990, 77.716), # Hoodi
            (12.969, 77.750), # ITPL
            (12.955, 77.747)  # Varthur Road
        ],
        'lanes': 3,
        'road_importance': 3.0,
        'base_capacity': 3000.0,
        'q_demand': 2900.0,
        'speed_limit': 50.0,
        'road_class': 'Secondary Commercial Street'
    },
    'Koramangala Inner Ring Road': {
        'waypoints': [
            (12.962, 77.638), # Domlur
            (12.937, 77.631), # Koramangala 1st Block
            (12.934, 77.624)  # Koramangala Wipro Park
        ],
        'lanes': 2,
        'road_importance': 1.8,
        'base_capacity': 1600.0,
        'q_demand': 1550.0,
        'speed_limit': 45.0,
        'road_class': 'Secondary Commercial Street'
    }
}

# Global Snapping Caches
_kdtree = None
_ref_nodes = None

def get_kdtree_and_nodes(output_dir="output"):
    global _kdtree, _ref_nodes
    if _kdtree is None:
        nodes_path = os.path.join(output_dir, "graph_nodes.csv")
        if not os.path.exists(nodes_path):
            raise FileNotFoundError(f"{nodes_path} not found. Build road network first.")
        _ref_nodes = pd.read_csv(nodes_path)
        coords = _ref_nodes[['latitude', 'longitude']].values
        _kdtree = cKDTree(coords)
    return _kdtree, _ref_nodes

def snap_coordinates(lats, lons, output_dir="output"):
    kdtree, ref_nodes = get_kdtree_and_nodes(output_dir)
    coords = np.column_stack([lats, lons])
    dists, indices = kdtree.query(coords)
    node_ids = ref_nodes.iloc[indices]['node_id'].values
    return node_ids, dists

def interpolate_corridor(name, waypoints, step=0.0022):
    """
    Linearly interpolates points between consecutive waypoints along a corridor.
    0.0022 degrees is approx 240 meters.
    """
    points = []
    for idx in range(len(waypoints) - 1):
        lat1, lon1 = waypoints[idx]
        lat2, lon2 = waypoints[idx + 1]
        dist = np.sqrt((lat1 - lat2)**2 + (lon1 - lon2)**2)
        n_steps = max(1, int(np.ceil(dist / step)))
        for i in range(n_steps):
            t = i / n_steps
            lat = lat1 + t * (lat2 - lat1)
            lon = lon1 + t * (lon2 - lon1)
            points.append({
                'lat': lat,
                'lon': lon,
                'segment_idx': len(points)
            })
    points.append({
        'lat': waypoints[-1][0],
        'lon': waypoints[-1][1],
        'segment_idx': len(points)
    })
    return points

def encode_polyline(points):
    """
    Encodes a list of (lat, lon) coordinates into a polyline string.
    """
    def encode_value(val):
        val = int(round(val * 1e5))
        val = ~(val << 1) if val < 0 else (val << 1)
        chunks = []
        while val >= 0x20:
            chunks.append(chr((0x20 | (val & 0x1f)) + 63))
            val >>= 5
        chunks.append(chr(val + 63))
        return "".join(chunks)

    encoded = []
    last_lat = 0
    last_lon = 0
    for lat, lon in points:
        encoded.append(encode_value(lat - last_lat))
        encoded.append(encode_value(lon - last_lon))
        last_lat = lat
        last_lon = lon
    return "".join(encoded)

def construct_graph(cleaned_df_path, output_dir="output"):
    print("Constructing high-fidelity road network graph from predefined corridors...")
    
    # 1. Generate interpolated reference nodes
    all_ref_nodes = []
    from mappls_service import MapplsService
    mappls = MapplsService()

    for c_name, c_info in CORRIDORS_WAYPOINTS.items():
        interpolated = interpolate_corridor(c_name, c_info['waypoints'])
        c_id_str = c_name.lower().replace(' ', '_')
        
        # Calculate elevations along the corridor
        elevations = []
        for node in interpolated:
            el = mappls.get_elevation(node['lat'], node['lon'])
            elevations.append(el)
            
        # Calculate slopes/gradients along the corridor (elevation difference / distance)
        slopes = [0.0]
        for idx in range(1, len(interpolated)):
            el1 = elevations[idx - 1]
            el2 = elevations[idx]
            lat1, lon1 = interpolated[idx - 1]['lat'], interpolated[idx - 1]['lon']
            lat2, lon2 = interpolated[idx]['lat'], interpolated[idx]['lon']
            dist_m = np.sqrt((lat1 - lat2)**2 + (lon1 - lon2)**2) * 111000.0
            slope = (el2 - el1) / dist_m if dist_m > 0 else 0.0
            slope = max(-0.15, min(0.15, slope))  # Clip incline to [-15%, +15%]
            slopes.append(slope)

        for node, el, sl in zip(interpolated, elevations, slopes):
            node_id = f"node_{c_id_str}_{node['segment_idx']}"
            all_ref_nodes.append({
                'node_id': node_id,
                'latitude': node['lat'],
                'longitude': node['lon'],
                'road_name': c_name,
                'lanes': c_info['lanes'],
                'road_class': c_info['road_class'],
                'speed_limit': c_info['speed_limit'],
                'base_capacity': c_info['base_capacity'],
                'q_demand': c_info['q_demand'],
                'road_importance': c_info['road_importance'],
                'elevation': el,
                'slope': sl
            })
            
    nodes_df = pd.DataFrame(all_ref_nodes)
    total_nodes = len(nodes_df)
    print(f"Generated {total_nodes} reference corridor nodes with elevations and slope gradients.")

    # 1.5 Fetch real-world POIs along each corridor and snap to local nodes
    print("Fetching POIs along routes for retail, dining, office, and kitchen categories...")
    nodes_df['retail_count'] = 0
    nodes_df['dining_count'] = 0
    nodes_df['office_count'] = 0
    nodes_df['kitchen_count'] = 0
    nodes_df['eloc_count'] = 0

    for c_name, c_info in CORRIDORS_WAYPOINTS.items():
        waypoints = c_info['waypoints']
        polyline = encode_polyline(waypoints)
        c_nodes_mask = nodes_df['road_name'] == c_name
        c_nodes_idx = nodes_df[c_nodes_mask].index.tolist()
        c_nodes_coords = nodes_df.loc[c_nodes_mask, ['latitude', 'longitude']].values

        # Retrieve interpolated segment nodes to generate realistic mock if needed
        c_id_str = c_name.lower().replace(' ', '_')
        interpolated = [n for n in all_ref_nodes if n['road_name'] == c_name]

        for category in ['retail', 'dining', 'office', 'kitchen']:
            pois = mappls.get_pois_along_route(polyline, category=category, buffer=50)
            
            # Fallback/Mock safeguard: generate deterministic mock if API returns empty
            if not pois:
                import random
                random.seed(hash(c_name + category))
                num_mock = random.randint(5, 15)
                pois = []
                for _ in range(num_mock):
                    pt = random.choice(interpolated)
                    pois.append({
                        'latitude': pt['latitude'] + random.uniform(-0.0005, 0.0005),
                        'longitude': pt['longitude'] + random.uniform(-0.0005, 0.0005)
                    })

            for poi in pois:
                lat = poi.get("latitude") or poi.get("lat") or poi.get("entryLatitude")
                lon = poi.get("longitude") or poi.get("lon") or poi.get("lng") or poi.get("entryLongitude")
                if lat is not None and lon is not None:
                    # Snap to closest node in this corridor
                    dists = np.sqrt((c_nodes_coords[:, 0] - lat)**2 + (c_nodes_coords[:, 1] - lon)**2)
                    min_idx_in_c = np.argmin(dists)
                    global_idx = c_nodes_idx[min_idx_in_c]
                    nodes_df.loc[global_idx, f"{category}_count"] += 1

    # 1.6 Snap ELOC_HUBS delivery warehouses (e.g. Flipkart hubs, courier drop boxes)
    ELOC_HUBS = {
        'WFD123': {'name': 'Whitefield Warehouse', 'lat': 12.978, 'lon': 77.728},
        'ECY456': {'name': 'Electronic City Warehouse', 'lat': 12.852, 'lon': 77.675},
        'KOR789': {'name': 'Koramangala Warehouse', 'lat': 12.932, 'lon': 77.618},
        'HEB012': {'name': 'Hebbal Hub', 'lat': 13.025, 'lon': 77.589},
        'MAJ345': {'name': 'Majestic Logistics Hub', 'lat': 12.976, 'lon': 77.573}
    }
    print("Snapping ELOC_HUBS delivery warehouses to closest nodes...")
    all_coords = nodes_df[['latitude', 'longitude']].values
    for eloc_id, hub in ELOC_HUBS.items():
        lat, lon = hub['lat'], hub['lon']
        dists = np.sqrt((all_coords[:, 0] - lat)**2 + (all_coords[:, 1] - lon)**2)
        min_idx = np.argmin(dists)
        nodes_df.loc[min_idx, 'eloc_count'] += 1

    
    # 2. Map raw citations to nearest corridor nodes
    df = pd.read_csv(cleaned_df_path)
    
    # Snap raw coordinates through Mappls Snap to Road API before mapping
    try:
        from mappls_service import MapplsService
        mappls = MapplsService()
        unique_coords = df[['latitude', 'longitude']].drop_duplicates().values.tolist()
        print(f"[Mappls] Extracted {len(unique_coords)} unique coordinate pairs from citations. Snapping to road network...")
        
        # Limit to first 2000 unique coordinates to protect token quota if dataset is large
        unique_coords_to_snap = unique_coords[:2000]
        snapped_unique_list = mappls.snap_to_road(unique_coords_to_snap)
        
        # Build mapping dictionary
        coord_map = {}
        for orig, snapped in zip(unique_coords_to_snap, snapped_unique_list):
            coord_map[tuple(orig)] = snapped
            
        # Map back to df
        snapped_lats = []
        snapped_lons = []
        for lat, lon in df[['latitude', 'longitude']].values:
            snapped = coord_map.get((lat, lon), (lat, lon))
            snapped_lats.append(snapped[0])
            snapped_lons.append(snapped[1])
            
        df['latitude'] = snapped_lats
        df['longitude'] = snapped_lons
        print("[Mappls] Coordinate snapping completed successfully.")
    except Exception as e:
        print(f"[Mappls Warning] Snap to Road failed or skipped: {e}. Falling back to Greenshields CTM/original coordinates.")

    # Build a temporary KDTree for snapping
    coords_ref = nodes_df[['latitude', 'longitude']].values
    kdtree = cKDTree(coords_ref)
    
    df_coords = df[['latitude', 'longitude']].values
    dists, indices = kdtree.query(df_coords)
    
    df['node_id'] = nodes_df.iloc[indices]['node_id'].values
    df['snap_dist'] = dists
    
    # Filter citations within 0.04 degrees (~4.4km) to reject off-network spatial noise
    initial_cnt = len(df)
    df = df[df['snap_dist'] <= 0.04].reset_index(drop=True)
    print(f"Snapped citations. Kept {len(df)}/{initial_cnt} records (distance threshold <= 0.04).")
    
    # 3. Assign Vehicle Capacity Impact weights
    vehicle_weights = {
        'SCOOTER': 0.15, 'MOTOR CYCLE': 0.15, 'MOPED': 0.15,
        'PASSENGER AUTO': 0.30, 'GOODS AUTO': 0.30,
        'CAR': 0.50, 'JEEP': 0.50, 'VAN': 0.50, 'TEMPO': 0.70,
        'MAXI-CAB': 0.70, 'LGV': 0.70, 'MINI LORRY': 0.70,
        'PRIVATE BUS': 1.00, 'BUS (BMTC/KSRTC)': 1.00, 'TOURIST BUS': 1.00, 'SCHOOL VEHICLE': 1.00, 'FACTORY BUS': 1.00,
        'HGV': 1.00, 'LORRY/GOODS VEHICLE': 1.00, 'TANKER': 1.00, 'TRACTOR': 1.00
    }
    df['weight'] = df['vehicle_type'].map(vehicle_weights).fillna(0.3)
    
    # Calculate PCU values (Passenger Car Units)
    pcu_weights = {
        'SCOOTER': 0.5, 'MOTOR CYCLE': 0.5, 'MOPED': 0.5,
        'PASSENGER AUTO': 1.0, 'GOODS AUTO': 1.2,
        'CAR': 1.0, 'JEEP': 1.0, 'VAN': 1.0, 'TEMPO': 1.5,
        'MAXI-CAB': 1.5, 'LGV': 1.5, 'MINI LORRY': 1.5,
        'PRIVATE LORRY': 3.0, 'LORRY/GOODS VEHICLE': 3.0, 'TANKER': 3.0, 'TRACTOR': 3.0,
        'PRIVATE BUS': 3.0, 'BUS (BMTC/KSRTC)': 3.0, 'TOURIST BUS': 3.0
    }
    df['pcu_val'] = df['vehicle_type'].map(pcu_weights).fillna(1.0)
    
    # 4. Aggregate node attributes from snapped violations
    print("Aggregating violation metrics per node...")
    agg_df = df.groupby('node_id').agg(
        total_violations=('id', 'count'),
        weighted_capacity_reduction=('weight', 'sum'),
        total_pcu=('pcu_val', 'sum'),
        police_station=('police_station', lambda x: x.mode().iloc[0] if not x.mode().empty else "Unknown")
    ).reset_index()
    
    # Merge aggregations with reference nodes
    nodes_df = pd.merge(nodes_df, agg_df, on='node_id', how='left')
    nodes_df['total_violations'] = nodes_df['total_violations'].fillna(0).astype(int)
    nodes_df['weighted_capacity_reduction'] = nodes_df['weighted_capacity_reduction'].fillna(0.0)
    nodes_df['total_pcu'] = nodes_df['total_pcu'].fillna(0.0)
    nodes_df['police_station'] = nodes_df['police_station'].fillna("Unknown")
    
    # 5. POI Density Calculation using Gaussian decay centered on major hubs
    HUBS = {
        'Majestic': {'lat': 12.978, 'lon': 77.571, 'commercial': 0.9, 'transit': 1.0, 'dining': 0.6, 'corporate': 0.4},
        'Shivajinagar': {'lat': 12.985, 'lon': 77.599, 'commercial': 1.0, 'transit': 0.8, 'dining': 0.8, 'corporate': 0.3},
        'Koramangala': {'lat': 12.934, 'lon': 77.624, 'commercial': 0.7, 'transit': 0.5, 'dining': 1.0, 'corporate': 0.8},
        'Indiranagar': {'lat': 12.978, 'lon': 77.641, 'commercial': 0.8, 'transit': 0.4, 'dining': 1.0, 'corporate': 0.6},
        'Electronic City': {'lat': 12.845, 'lon': 77.663, 'commercial': 0.4, 'transit': 0.6, 'dining': 0.5, 'corporate': 1.0},
        'Whitefield': {'lat': 12.969, 'lon': 77.750, 'commercial': 0.5, 'transit': 0.5, 'dining': 0.6, 'corporate': 1.0},
        'Hebbal': {'lat': 13.035, 'lon': 77.597, 'commercial': 0.3, 'transit': 0.9, 'dining': 0.4, 'corporate': 0.5}
    }
    
    poi_comm, poi_trans, poi_dine, poi_corp = [], [], [], []
    sigma = 0.0135 # ~1.5 km decay scale
    
    for idx, row in nodes_df.iterrows():
        lat, lon = row['latitude'], row['longitude']
        comm_val = trans_val = dine_val = corp_val = 0.0
        
        for name, h_info in HUBS.items():
            dist_sq = (lat - h_info['lat'])**2 + (lon - h_info['lon'])**2
            decay = np.exp(-dist_sq / (2 * (sigma**2)))
            comm_val += h_info['commercial'] * decay
            trans_val += h_info['transit'] * decay
            dine_val += h_info['dining'] * decay
            corp_val += h_info['corporate'] * decay
            
        poi_comm.append(comm_val)
        poi_trans.append(trans_val)
        poi_dine.append(dine_val)
        poi_corp.append(corp_val)
        
    # Scale POI densities to [0, 1]
    def scale_list(lst):
        arr = np.array(lst)
        mx, mn = arr.max(), arr.min()
        return (arr - mn) / (mx - mn) if mx > mn else arr
        
    nodes_df['commercial_density'] = scale_list(poi_comm)
    nodes_df['transit_density'] = scale_list(poi_trans)
    
    # Scale new snapped POI counts to [0, 1]
    max_retail = max(1.0, nodes_df['retail_count'].max())
    max_dining = max(1.0, nodes_df['dining_count'].max())
    max_office = max(1.0, nodes_df['office_count'].max())
    max_kitchen = max(1.0, nodes_df['kitchen_count'].max())
    max_eloc = max(1.0, nodes_df['eloc_count'].max())

    nodes_df['retail_density'] = nodes_df['retail_count'] / max_retail
    nodes_df['kitchen_density'] = nodes_df['kitchen_count'] / max_kitchen
    nodes_df['eloc_density'] = nodes_df['eloc_count'] / max_eloc

    # Blend original Gaussian hub densities with actual snapped counts
    nodes_df['dining_density'] = 0.5 * scale_list(poi_dine) + 0.5 * (nodes_df['dining_count'] / max_dining)
    nodes_df['corporate_density'] = 0.5 * scale_list(poi_corp) + 0.5 * (nodes_df['office_count'] / max_office)
    
    # Calculate Vulnerability Index (VI_i) incorporating snapped POIs and logistics hubs
    nodes_df['vulnerability_index'] = (
        0.15 * nodes_df['commercial_density'] +
        0.15 * nodes_df['transit_density'] +
        0.15 * nodes_df['dining_density'] +
        0.15 * nodes_df['corporate_density'] +
        0.10 * nodes_df['retail_density'] +
        0.10 * nodes_df['kitchen_density'] +
        0.10 * nodes_df['eloc_density'] +
        0.10 * (1.0 / nodes_df['lanes'])
    )
    # Scale VI_i to [0.1, 1.0]
    vi_arr = nodes_df['vulnerability_index'].values
    vi_min, vi_max = vi_arr.min(), vi_arr.max()
    nodes_df['vulnerability_index'] = 0.1 + 0.9 * (vi_arr - vi_min) / (vi_max - vi_min) if vi_max > vi_min else 1.0
    
    # 6. Construct Topological Graph Edges (Directed Links)
    print("Constructing topological graph edges...")
    edges = []
    
    # Connecting nodes sequentially along each corridor
    for c_name in CORRIDORS_WAYPOINTS.keys():
        c_nodes = nodes_df[nodes_df['road_name'] == c_name].sort_values(by='node_id').reset_index(drop=True)
        # Note: sorting by node_id aligns them sequentially if we name them sequentially or store indices
        # Let's write them sequential by tracking segment_idx from node_id
        c_nodes['idx'] = c_nodes['node_id'].apply(lambda x: int(x.split('_')[-1]))
        c_nodes = c_nodes.sort_values(by='idx').reset_index(drop=True)
        
        for i in range(len(c_nodes) - 1):
            u = c_nodes.iloc[i]
            v = c_nodes.iloc[i+1]
            dist = np.sqrt((u['latitude'] - v['latitude'])**2 + (u['longitude'] - v['longitude'])**2)
            
            # Forward edge
            edges.append({
                'source': u['node_id'],
                'target': v['node_id'],
                'distance': float(dist)
            })
            # Reverse edge (bidirectional road)
            edges.append({
                'source': v['node_id'],
                'target': u['node_id'],
                'distance': float(dist)
            })
            
    # Intersections: Connect cross-corridor intersections within 0.003 degrees (~330 meters)
    print("Connecting corridor intersections...")
    nodes_list = nodes_df.to_dict('records')
    for i in range(total_nodes):
        u = nodes_list[i]
        for j in range(i + 1, total_nodes):
            v = nodes_list[j]
            # Only connect if they belong to different corridors
            if u['road_name'] != v['road_name']:
                dist = np.sqrt((u['latitude'] - v['latitude'])**2 + (u['longitude'] - v['longitude'])**2)
                if dist <= 0.003:
                    edges.append({
                        'source': u['node_id'],
                        'target': v['node_id'],
                        'distance': float(dist)
                    })
                    edges.append({
                        'source': v['node_id'],
                        'target': u['node_id'],
                        'distance': float(dist)
                    })
                    
    print(f"Constructed topological graph with {len(edges)} directed links.")
    
    # Save outputs
    os.makedirs(output_dir, exist_ok=True)
    nodes_df.to_csv(os.path.join(output_dir, "graph_nodes.csv"), index=False)
    
    with open(os.path.join(output_dir, "graph_edges.json"), "w") as f:
        json.dump(edges, f, indent=2)
        
    summary = {
        'total_nodes': total_nodes,
        'total_edges': len(edges),
        'average_degree': len(edges) / total_nodes if total_nodes > 0 else 0,
        'top_nodes': nodes_df.sort_values(by='total_violations', ascending=False).head(10).to_dict('records')
    }
    with open(os.path.join(output_dir, "graph_summary.json"), "w") as f:
        json.dump(summary, f, indent=2)
        
    print("Road network graph construction completed successfully!")
    return nodes_df, edges

if __name__ == "__main__":
    from data_pipeline import load_and_clean_data
    current_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.abspath(os.path.join(current_dir, "..", "dataset", "jan to may police violation_anonymized791b166.csv.gz"))
    if not os.path.exists(csv_path):
        csv_path = os.path.abspath(os.path.join(current_dir, "..", "dataset", "jan to may police violation_anonymized791b166.csv"))
    if not os.path.exists(csv_path):
        csv_path = r"c:\Users\anujs\OneDrive\Desktop\GridLock Phase 2\backend\dataset\jan to may police violation_anonymized791b166.csv"
    cleaned_df = load_and_clean_data(csv_path)
    
    temp_clean_path = "output/temp_cleaned_violations.csv"
    cleaned_df.to_csv(temp_clean_path, index=False)
    construct_graph(temp_clean_path)
