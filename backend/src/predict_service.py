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
    
    # 3. Perform live XGBoost prediction
    # model.predict takes a 2D array: [1, 14]
    xgb_pred_raw = float(model.predict(features.reshape(1, -1))[0])
    
    # Inverse log-transform predictions if the model was trained with log-transform
    # In train.py: target_risk = np.log1p(target_risk) and we inverse-transform via expm1
    # stgat_model is log-transformed by default in train_model(log_transform=True)
    # The offline evaluation logic does: if log_transform: xgb_risk = np.expm1(xgb_risk)
    # Let's inspect train_xgboost_fallback_model in train.py:
    # "Y_train_tab = Y_train.numpy().flatten()", where Y_train is already log-transformed if log_transform=True!
    # So yes, XGBoost predictions must be inverse-transformed via expm1 if trained on log-transformed targets.
    # In our project config, log_transform is True. Let's make sure we expm1 it!
    # To be extremely safe: since risk values are in [0, 1], let's check if the raw prediction exceeds 1.0 or if we expm1.
    # Wait, in run_inference_pipeline in train.py:
    # "xgb_risk = xgb_model.predict(last_x_seq_tab)"
    # "if getattr(stgat_model, 'log_transform', False): xgb_risk = np.expm1(xgb_risk)"
    # So we apply expm1 and clip to [0, 1].
    # Let's verify if log_transform is enabled in our model: we can assume yes, and apply expm1.
    # Wait, can we check if the raw prediction is log-transformed?
    # If the output values are small (e.g. log1p values are in [0, log(2)]), expm1 makes them back to [0, 1].
    # Let's do expm1 since train_model ran with log_transform=True by default.
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
        "lanes": float(features[13])
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
