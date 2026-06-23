import os
import pandas as pd
import numpy as np
from xgboost import XGBRegressor

current_dir = os.path.dirname(os.path.abspath(__file__))
possible_output_dirs = [
    os.path.abspath(os.path.join(current_dir, "..", "output")),
    os.path.abspath(os.path.join(current_dir, "output")),
    os.path.abspath("output")
]

# Locate output directory dynamically
output_dir = None
for d in possible_output_dirs:
    if os.path.exists(os.path.join(d, "nodes_with_clusters.csv")):
        output_dir = d
        break
if output_dir is None:
    output_dir = possible_output_dirs[0]

# Singleton cache state
_xgb_model = None
_nodes_df = None

def get_xgboost_model():
    global _xgb_model
    if _xgb_model is None:
        model_path = os.path.join(output_dir, "xgboost_fallback.json")
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"XGBoost fallback model file not found at: {model_path}")
        _xgb_model = XGBRegressor()
        _xgb_model.load_model(model_path)
        print(f"[Predict Service] XGBoost fallback model loaded from {model_path}")
    return _xgb_model

def get_nodes_df():
    global _nodes_df
    if _nodes_df is None:
        csv_path = os.path.join(output_dir, "nodes_with_clusters.csv")
        if not os.path.exists(csv_path):
            # Fallback to graph_nodes.csv if clusters are not yet analyzed
            csv_path = os.path.join(output_dir, "graph_nodes.csv")
        if not os.path.exists(csv_path):
            raise FileNotFoundError(f"Nodes database not found at: {csv_path}")
        _nodes_df = pd.read_csv(csv_path)
        # Ensure node_id is treated as string for lookup
        _nodes_df['node_id'] = _nodes_df['node_id'].astype(str)
        _nodes_df.set_index('node_id', inplace=True, drop=False)
        print(f"[Predict Service] Nodes database loaded from {csv_path} with {len(_nodes_df)} nodes.")
        
        # Precompute static spatial lags right here
        try:
            import json
            edges_path = os.path.join(output_dir, "graph_edges.json")
            if os.path.exists(edges_path):
                with open(edges_path, 'r') as f:
                    edges_data = json.load(f)
                num_nodes = len(_nodes_df)
                node_ids = _nodes_df['node_id'].tolist()
                node_to_idx = {nid: i for i, nid in enumerate(node_ids)}
                
                lats = _nodes_df['latitude'].values
                lons = _nodes_df['longitude'].values
                D = np.sqrt((lats[:, None] - lats[None, :])**2 + (lons[:, None] - lons[None, :])**2)
                W = 1.0 / (D + 1e-4)
                np.fill_diagonal(W, 0.0)
                W_sum = W.sum(axis=1, keepdims=True)
                W_norm = np.where(W_sum > 0, W / W_sum, 0.0)
                
                adj_list = {i: [] for i in range(num_nodes)}
                for edge in edges_data:
                    src_idx = node_to_idx.get(edge['source'])
                    tgt_idx = node_to_idx.get(edge['target'])
                    if src_idx is not None and tgt_idx is not None:
                        adj_list[src_idx].append(tgt_idx)
                        
                adj_list_2nd = {i: [] for i in range(num_nodes)}
                for u in range(num_nodes):
                    visited = {u}
                    for v in adj_list[u]:
                        visited.add(v)
                    for v in adj_list[u]:
                        for w in adj_list[v]:
                            if w not in visited:
                                adj_list_2nd[u].append(w)
                                visited.add(w)
                                
                A_1st = np.zeros((num_nodes, num_nodes))
                for i in range(num_nodes):
                    neighbors = adj_list[i]
                    if len(neighbors) > 0:
                        A_1st[i, neighbors] = 1.0 / len(neighbors)
                    else:
                        A_1st[i, i] = 1.0
                        
                A_2nd = np.zeros((num_nodes, num_nodes))
                for i in range(num_nodes):
                    neighbors = adj_list_2nd[i]
                    if len(neighbors) > 0:
                        A_2nd[i, neighbors] = 1.0 / len(neighbors)
                    else:
                        A_2nd[i, i] = 1.0
                        
                # 906 shifts in historical dataset (Nov 10, 2023 - Apr 9, 2024), scaling counts by / 20.0
                viols = _nodes_df['total_violations'].values / (906.0 * 20.0)
                
                _nodes_df['lag_1'] = viols @ A_1st.T
                _nodes_df['lag_2'] = viols @ A_2nd.T
                _nodes_df['lag_dist'] = viols @ W_norm.T
                print("[Predict Service] Spatial lags precomputed successfully.")
            else:
                print(f"[Predict Service] Warning: graph_edges.json not found at {edges_path}. Spatial lags won't be calculated.")
        except Exception as e:
            print(f"[Predict Service] Error precomputing spatial lags: {e}")
    return _nodes_df

def build_feature_vector(node_row, hour, day_of_week, scooter_count, car_count, auto_count, total_count=None, lanes_override=None):
    """
    Builds the 14-feature vector exactly as defined in the offline pipeline.
    """
    # 1. Cyclical temporal values
    hour_sin = np.sin(2 * np.pi * hour / 24.0)
    hour_cos = np.cos(2 * np.pi * hour / 24.0)
    dow_sin = np.sin(2 * np.pi * day_of_week / 7.0)
    dow_cos = np.cos(2 * np.pi * day_of_week / 7.0)
    
    # 2. Scaled vehicle counts
    s_count = float(scooter_count) / 10.0
    c_count = float(car_count) / 10.0
    a_count = float(auto_count) / 10.0
    
    if total_count is None:
        tot_val = float(scooter_count + car_count + auto_count)
    else:
        tot_val = float(total_count)
    t_count = tot_val / 20.0
    
    # 3. Static densities & features
    comm_density = float(node_row.get('commercial_density', 0.0))
    trans_density = float(node_row.get('transit_density', 0.0))
    dine_density = float(node_row.get('dining_density', 0.0))
    corp_density = float(node_row.get('corporate_density', 0.0))
    vuln_idx = float(node_row.get('vulnerability_index', 1.0))
    
    lanes = float(lanes_override if lanes_override is not None else node_row.get('lanes', 2.0))
    scaled_lanes = lanes / 4.0
    
    # Pack into array of 14 features in correct order:
    features = [
        hour_sin,          # 0
        hour_cos,          # 1
        dow_sin,           # 2
        dow_cos,           # 3
        s_count,           # 4
        c_count,           # 5
        a_count,           # 6
        t_count,           # 7
        comm_density,      # 8
        trans_density,     # 9
        dine_density,      # 10
        corp_density,      # 11
        vuln_idx,          # 12
        scaled_lanes       # 13
    ]
    return np.array(features, dtype=np.float32)

def predict_scenario(node_id, hour, day_of_week, scooter_count, car_count, auto_count, total_count=None, lanes_override=None):
    """
    Computes baseline and scenario risks for a given node.
    """
    df = get_nodes_df()
    str_node_id = str(node_id)
    if str_node_id not in df.index:
        raise KeyError(f"Node ID '{node_id}' not found in nodes database.")
        
    node_row = df.loc[str_node_id]
    model = get_xgboost_model()
    
    # 1. Fetch baselines from the stored telemetry file
    # Map column defaults if they don't exist
    baseline_gnn = float(node_row.get('stgat_risk', node_row.get('predicted_risk', 0.5)))
    baseline_xgb = float(node_row.get('xgboost_risk', 0.5))
    baseline_hybrid = float(node_row.get('predicted_risk', 0.5))
    
    # 2. Build feature vector for the custom scenario
    features = build_feature_vector(
        node_row, hour, day_of_week, scooter_count, car_count, auto_count, 
        total_count=total_count, lanes_override=lanes_override
    )
    
    # Extract static neighbor spatial lags precomputed for this node
    lag_1 = float(node_row.get('lag_1', 0.0))
    lag_2 = float(node_row.get('lag_2', 0.0))
    lag_dist = float(node_row.get('lag_dist', 0.0))
    
    # Append to construct the 17-feature vector expected by the XGBoost fallback model
    features_17 = np.append(features, [lag_1, lag_2, lag_dist])
    
    # 3. Perform live XGBoost prediction
    # model.predict takes a 2D array: [1, 17]
    xgb_pred_raw = float(model.predict(features_17.reshape(1, -1))[0])
    
    # Inverse log-transform predictions if the model was trained with log-transform
    xgb_pred = np.expm1(xgb_pred_raw)
    xgb_pred = float(np.clip(xgb_pred, 0.0, 1.0))
    
    # 4. Blend to compute scenario hybrid risk
    scenario_gnn = baseline_gnn
    scenario_hybrid = float(np.clip(0.6 * scenario_gnn + 0.4 * xgb_pred, 0.0, 1.0))
    
    # 5. Build response dict
    feature_dict = {
        "hour_sin": float(features[0]),
        "hour_cos": float(features[1]),
        "dow_sin": float(features[2]),
        "dow_cos": float(features[3]),
        "scooter_count": float(features[4]),
        "car_count": float(features[5]),
        "auto_count": float(features[6]),
        "total_count": float(features[7]),
        "commercial_density": float(features[8]),
        "transit_density": float(features[9]),
        "dining_density": float(features[10]),
        "corporate_density": float(features[11]),
        "vulnerability_index": float(features[12]),
        "lanes": float(features[13]),
        "lag_1": lag_1,
        "lag_2": lag_2,
        "lag_dist": lag_dist
    }
    
    return {
        "node_id": str_node_id,
        "road_name": str(node_row.get('road_name', 'Unknown Road')),
        "police_station": str(node_row.get('police_station', 'Unknown Station')),
        "baseline": {
            "risk_gnn": baseline_gnn,
            "risk_xgboost": baseline_xgb,
            "risk_hybrid": baseline_hybrid
        },
        "scenario": {
            "risk_gnn": scenario_gnn,
            "risk_xgboost": xgb_pred,
            "risk_hybrid": scenario_hybrid
        },
        "delta_risk_hybrid": float(scenario_hybrid - baseline_hybrid),
        "feature_vector": feature_dict,
        "note": "GNN component reflects the model's last trained forecast for this corridor; the XGBoost component is recomputed live from your inputs."
    }
