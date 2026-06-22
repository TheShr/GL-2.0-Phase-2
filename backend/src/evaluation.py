import sys
# Mask transformers to prevent PyTorch/ONNX from importing it and crashing on version mismatches
sys.modules['transformers'] = None

import os
import pandas as pd
import numpy as np
import torch
import json
from sklearn.cluster import DBSCAN
from collections import Counter

# Add src to path for imports
sys.path.append(os.path.dirname(__file__))

from model import STGATModel
from road_network import snap_coordinates

def run_system_evaluation(raw_csv_path, nodes_csv_path, edges_json_path, output_dir="output", log_transform=True):
    print("\n=========================================================================")
    print("                      ATLAS AI SYSTEM EVALUATION SUITE")
    print("=========================================================================\n")
    
    # 1. Load data
    df = pd.read_csv(raw_csv_path)
    nodes_df = pd.read_csv(nodes_csv_path)
    with open(edges_json_path, 'r') as f:
        edges_data = json.load(f)
        
    df['created_ist'] = pd.to_datetime(df['created_ist'], format='mixed')
    
    # Snap coords to nearest corridor nodes
    print("Snapping raw coords to road network...")
    df['node_id'], df['snap_dist'] = snap_coordinates(df['latitude'].values, df['longitude'].values, output_dir=output_dir)
    df = df[df['snap_dist'] <= 0.04].reset_index(drop=True)
    
    num_nodes = len(nodes_df)
    node_to_idx = {nid: i for i, nid in enumerate(nodes_df['node_id'])}
    df['node_idx'] = df['node_id'].map(node_to_idx)
    df = df.dropna(subset=['node_idx'])
    df['node_idx'] = df['node_idx'].astype(int)
    
    # Temporal Split (Train: < March 1, 2024; Test: >= March 1, 2024)
    split_date = pd.to_datetime("2024-03-01").tz_localize("Asia/Kolkata")
    train_df = df[df['created_ist'] < split_date]
    test_df = df[df['created_ist'] >= split_date]
    
    print(f"Data split: Train records: {len(train_df)} | Test records: {len(test_df)}")
    
    # 2. Build Spatio-Temporal Grid
    start_time = df['created_ist'].min()
    df['shift_idx'] = ((df['created_ist'] - start_time).dt.total_seconds() / (4 * 3600)).astype(int)
    num_shifts = df['shift_idx'].max() + 1
    
    # Test split shift index
    test_start_shift = int(((split_date - start_time).total_seconds() / (4 * 3600)))
    
    # Prepare vehicle flags
    df['is_car'] = (df['vehicle_type'].isin(['CAR', 'VAN', 'JEEP'])).astype(float)
    df['is_two_wheeler'] = (df['vehicle_type'].isin(['SCOOTER', 'MOTOR CYCLE', 'MOPED'])).astype(float)
    df['is_auto'] = (df['vehicle_type'].isin(['PASSENGER AUTO', 'GOODS AUTO'])).astype(float)
    
    vehicle_weights = {
        'SCOOTER': 0.15, 'MOTOR CYCLE': 0.15, 'MOPED': 0.15,
        'PASSENGER AUTO': 0.30, 'GOODS AUTO': 0.30,
        'CAR': 0.50, 'JEEP': 0.50, 'VAN': 0.50, 'TEMPO': 0.70,
        'MAXI-CAB': 0.70, 'LGV': 0.70, 'MINI LORRY': 0.70,
        'PRIVATE BUS': 1.00, 'BUS (BMTC/KSRTC)': 1.00, 'TOURIST BUS': 1.00
    }
    df['cap_weight'] = df['vehicle_type'].map(vehicle_weights).fillna(0.3)
    
    # Shape: [num_shifts, num_nodes, 14]
    num_features = 14
    grid = np.zeros((num_shifts, num_nodes, num_features + 1))
    
    for s in range(num_shifts):
        shift_time = start_time + pd.Timedelta(seconds=s * 4 * 3600)
        hour = shift_time.hour
        dow = shift_time.dayofweek
        
        grid[s, :, 0] = np.sin(2 * np.pi * hour / 24.0)
        grid[s, :, 1] = np.cos(2 * np.pi * hour / 24.0)
        grid[s, :, 2] = np.sin(2 * np.pi * dow / 7.0)
        grid[s, :, 3] = np.cos(2 * np.pi * dow / 7.0)
        grid[s, :, 8] = nodes_df['commercial_density'].values
        grid[s, :, 9] = nodes_df['transit_density'].values
        grid[s, :, 10] = nodes_df['dining_density'].values
        grid[s, :, 11] = nodes_df['corporate_density'].values
        grid[s, :, 12] = nodes_df['vulnerability_index'].values
        grid[s, :, 13] = nodes_df['lanes'].values / 4.0
        
    grouped = df.groupby(['shift_idx', 'node_idx']).agg(
        scooter_count=('is_two_wheeler', 'sum'),
        car_count=('is_car', 'sum'),
        auto_count=('is_auto', 'sum'),
        total_count=('id', 'count'),
        capacity_loss=('cap_weight', 'sum')
    ).reset_index()
    
    for _, row in grouped.iterrows():
        s = int(row['shift_idx'])
        n = int(row['node_idx'])
        grid[s, n, 4] = row['scooter_count'] / 10.0
        grid[s, n, 5] = row['car_count'] / 10.0
        grid[s, n, 6] = row['auto_count'] / 10.0
        grid[s, n, 7] = row['total_count'] / 20.0
        grid[s, n, 14] = row['capacity_loss']
        
    # Synthetic evening demand multiplier deleted (timezone bug corrected)
    
    # 3. Load Trained Models and Checkpoint Hash Verification
    stgat_baseline_path = os.path.join(output_dir, "stgat_baseline.pt")
    stgat_tuned_path = os.path.join(output_dir, "stgat_tuned.pt")
    stgat_path = os.path.join(output_dir, "stgat_model.pt")
    xgb_path = os.path.join(output_dir, "xgboost_fallback.json")
    
    if not (os.path.exists(xgb_path) and (os.path.exists(stgat_tuned_path) or os.path.exists(stgat_path))):
        raise FileNotFoundError("Required model weights not found. Run train.py first to train ST-GAT and XGBoost fallback.")
        
    import hashlib
    def get_file_hash(path):
        with open(path, 'rb') as f:
            return hashlib.sha256(f.read()).hexdigest()
            
    if os.path.exists(stgat_baseline_path) and os.path.exists(stgat_tuned_path):
        b_hash = get_file_hash(stgat_baseline_path)
        t_hash = get_file_hash(stgat_tuned_path)
        assert b_hash != t_hash, f"Checkpoint Hash Collision! Both stgat_baseline.pt and stgat_tuned.pt are identical ({b_hash[:16]}). Ensure separate baseline and tuned training runs were executed."
        print(f"Checkpoint verification passed.\n  Baseline hash: {b_hash[:16]}\n  Tuned hash   : {t_hash[:16]}")
        
    print("Loading GNN models...")
    model_baseline = STGATModel(num_nodes=num_nodes, in_features=num_features, spatial_hidden=16, temporal_hidden=8, log_transform=log_transform)
    if os.path.exists(stgat_baseline_path):
        model_baseline.load_state_dict(torch.load(stgat_baseline_path))
    model_baseline.eval()
    
    model_tuned = STGATModel(num_nodes=num_nodes, in_features=num_features, spatial_hidden=64, temporal_hidden=32, log_transform=log_transform)
    target_stgat_weights = stgat_tuned_path if os.path.exists(stgat_tuned_path) else stgat_path
    model_tuned.load_state_dict(torch.load(target_stgat_weights))
    model_tuned.eval()
    
    print("Loading XGBoost fallback model...")
    from xgboost import XGBRegressor
    xgb = XGBRegressor()
    xgb.load_model(xgb_path)
    
    # 4. Map edges index
    edge_sources = []
    edge_targets = []
    for edge in edges_data:
        src_idx = node_to_idx.get(edge['source'])
        tgt_idx = node_to_idx.get(edge['target'])
        if src_idx is not None and tgt_idx is not None:
            edge_sources.append(src_idx)
            edge_targets.append(tgt_idx)
    edge_index = torch.tensor([edge_sources, edge_targets], dtype=torch.long)
    
    # 5. Evaluate on Test Shifts (March-April 2024)
    print("\nRunning test inference split over March-April 2024...")
    seq_len = 6
    
    # Define stratified validation categories
    holidays = {
        pd.to_datetime("2023-11-12").date(), # Diwali
        pd.to_datetime("2023-12-25").date(), # Christmas
        pd.to_datetime("2024-01-01").date(), # New Year
        pd.to_datetime("2024-01-26").date(), # Republic Day
        pd.to_datetime("2024-03-08").date(), # Maha Shivratri
        pd.to_datetime("2024-03-29").date(), # Good Friday
    }
    rainy_dates = {
        pd.to_datetime("2024-04-02").date(),
        pd.to_datetime("2024-04-05").date(),
        pd.to_datetime("2024-04-06").date(),
    }
    
    # Precalculate historical average over train set
    hist_avg = grid[:test_start_shift, :, 7].mean(axis=0) * 20.0
    
    # Lists to store metrics
    y_true_all = []
    y_pred_hist = []
    y_pred_xgb = []
    y_pred_base = []
    y_pred_tuned = []
    y_pred_hybrid = []
    
    # Stratified splits lists
    y_true_cats = {"normal": [], "holiday": [], "rain": []}
    y_pred_hybrid_cats = {"normal": [], "holiday": [], "rain": []}
    
    from train import build_spatial_lag_features
    
    test_shifts = list(range(test_start_shift, num_shifts))
    for s in test_shifts:
        if s < seq_len:
            continue
            
        y_true_s = grid[s, :, 7] * 20.0  # Raw violation count
        x_seq_s = torch.tensor(grid[s - seq_len : s, :, :num_features], dtype=torch.float32).unsqueeze(0)
        
        # 1. Historical Average
        y_pred_hist_s = hist_avg
        
        # 2. XGBoost with spatial lags
        xgb_input = build_spatial_lag_features(x_seq_s, edge_index, nodes_df)
        xgb_pred = xgb.predict(xgb_input)
        if log_transform:
            xgb_pred = np.expm1(xgb_pred)
        y_pred_xgb_s = np.maximum(xgb_pred * 20.0, 0.0)
        
        # 3. ST-GAT Baseline
        with torch.no_grad():
            gnn_base_tensor = model_baseline(x_seq_s, edge_index).squeeze(0)
            if log_transform:
                gnn_base_tensor = torch.expm1(gnn_base_tensor)
            gnn_base_pred = gnn_base_tensor.cpu().numpy()
        y_pred_base_s = np.maximum(gnn_base_pred * 20.0, 0.0)
        
        # 4. ST-GAT Tuned
        with torch.no_grad():
            gnn_tuned_tensor = model_tuned(x_seq_s, edge_index).squeeze(0)
            if log_transform:
                gnn_tuned_tensor = torch.expm1(gnn_tuned_tensor)
            gnn_tuned_pred = gnn_tuned_tensor.cpu().numpy()
        y_pred_tuned_s = np.maximum(gnn_tuned_pred * 20.0, 0.0)
        
        # 5. Hybrid model
        y_pred_hybrid_s = 0.6 * y_pred_tuned_s + 0.4 * y_pred_xgb_s
        y_pred_hybrid_s = np.maximum(y_pred_hybrid_s, 0.0)
        
        # Aggregate
        y_true_all.append(y_true_s)
        y_pred_hist.append(y_pred_hist_s)
        y_pred_xgb.append(y_pred_xgb_s)
        y_pred_base.append(y_pred_base_s)
        y_pred_tuned.append(y_pred_tuned_s)
        y_pred_hybrid.append(y_pred_hybrid_s)
        
        # Stratify
        shift_time = start_time + pd.Timedelta(seconds=s * 4 * 3600)
        shift_date = shift_time.date()
        cat = "holiday" if shift_date in holidays else ("rain" if shift_date in rainy_dates else "normal")
        y_true_cats[cat].append(y_true_s)
        y_pred_hybrid_cats[cat].append(y_pred_hybrid_s)
        
    y_true_all = np.array(y_true_all)
    y_pred_hist = np.array(y_pred_hist)
    y_pred_xgb = np.array(y_pred_xgb)
    y_pred_base = np.array(y_pred_base)
    y_pred_tuned = np.array(y_pred_tuned)
    y_pred_hybrid = np.array(y_pred_hybrid)
    
    # Save hybrid risk outputs back to graph_nodes.csv for UI Command Center
    node_y_pred_hybrid = y_pred_hybrid.sum(axis=0)
    nodes_df['predicted_risk'] = (node_y_pred_hybrid / node_y_pred_hybrid.max()) if node_y_pred_hybrid.max() > 0 else 0.0
    nodes_df.to_csv(os.path.join(output_dir, "graph_nodes.csv"), index=False)
    
    # Helper to compute metrics
    def calculate_metrics(y_true, y_pred):
        node_y_true = y_true.sum(axis=0)
        node_y_pred = y_pred.sum(axis=0)
        
        threshold_idx = int(num_nodes * 0.10)
        true_threshold = np.partition(node_y_true, -threshold_idx)[-threshold_idx]
        pred_threshold = np.partition(node_y_pred, -threshold_idx)[-threshold_idx]
        
        labels_true = (node_y_true >= true_threshold).astype(int)
        labels_pred = (node_y_pred >= pred_threshold).astype(int)
        
        tp = np.sum((labels_true == 1) & (labels_pred == 1))
        fp = np.sum((labels_true == 0) & (labels_pred == 1))
        fn = np.sum((labels_true == 1) & (labels_pred == 0))
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
        
        mae = np.mean(np.abs(y_true - y_pred))
        rmse = np.sqrt(np.mean((y_true - y_pred) ** 2))
        return f1, precision, recall, mae, rmse

    # 6. CALCULATE EVALUATION METRICS
    m_hist = calculate_metrics(y_true_all, y_pred_hist)
    m_xgb = calculate_metrics(y_true_all, y_pred_xgb)
    m_base = calculate_metrics(y_true_all, y_pred_base)
    m_tuned = calculate_metrics(y_true_all, y_pred_tuned)
    m_hybrid = calculate_metrics(y_true_all, y_pred_hybrid)
    
    # Save baseline comparison report as CSV
    comparison_df = pd.DataFrame([
        {"Model Family": "Historical Average", "F1-Score": m_hist[0], "Precision@10": m_hist[1], "Recall@10": m_hist[2], "MAE": m_hist[3], "RMSE": m_hist[4]},
        {"Model Family": "XGBoost (Spatial Lag)", "F1-Score": m_xgb[0], "Precision@10": m_xgb[1], "Recall@10": m_xgb[2], "MAE": m_xgb[3], "RMSE": m_xgb[4]},
        {"Model Family": "ST-GATv2 (Baseline)", "F1-Score": m_base[0], "Precision@10": m_base[1], "Recall@10": m_base[2], "MAE": m_base[3], "RMSE": m_base[4]},
        {"Model Family": "ST-GATv2 (Tuned)", "F1-Score": m_tuned[0], "Precision@10": m_tuned[1], "Recall@10": m_tuned[2], "MAE": m_tuned[3], "RMSE": m_tuned[4]},
        {"Model Family": "ST-GATv2 (Hybrid)", "F1-Score": m_hybrid[0], "Precision@10": m_hybrid[1], "Recall@10": m_hybrid[2], "MAE": m_hybrid[3], "RMSE": m_hybrid[4]}
    ])
    comparison_df.to_csv(os.path.join(output_dir, "baselines_comparison.csv"), index=False)
    
    # Compute stratified metrics for hybrid model
    strat_metrics = {}
    for cat in ["normal", "holiday", "rain"]:
        if len(y_true_cats[cat]) > 0:
            yt = np.array(y_true_cats[cat])
            yp = np.array(y_pred_hybrid_cats[cat])
            strat_metrics[cat] = calculate_metrics(yt, yp)
        else:
            strat_metrics[cat] = (0.0, 0.0, 0.0, 0.0, 0.0)

    # 7. Enforcement Delay Savings and DBSCAN metrics
    recs_path = os.path.join(output_dir, "enforcement_schedule.csv")
    est_reduction_hours = 0.0
    avg_capacity_recovered = 0.0
    if os.path.exists(recs_path):
        recs_df = pd.read_csv(recs_path)
        top_10_recs = recs_df.head(10)
        def parse_hours(val):
            try: return float(str(val).replace(" hours", ""))
            except: return 0.0
        def parse_rcf(val):
            try:
                val_str = str(val).strip()
                if "%" in val_str: return float(val_str.replace("%", ""))
                return float(val_str) * 100.0 if float(val_str) <= 1.0 else float(val_str)
            except: return 0.0
        est_reduction_hours = top_10_recs['total_commuter_time_saved_hours'].apply(parse_hours).sum()
        avg_capacity_recovered = top_10_recs['capacity_reduction_rcf'].apply(parse_rcf).mean()
        
    dbscan_purity = 0.0
    hotspot_coverage = 0.0
    nodes_clustered_path = os.path.join(output_dir, "nodes_with_clusters.csv")
    if os.path.exists(nodes_clustered_path):
        df_clustered = pd.read_csv(nodes_clustered_path)
        clustered_nodes = df_clustered[df_clustered['cluster_id'] != -1]
        if len(clustered_nodes) > 0:
            purity_sum = 0
            for cid in clustered_nodes['cluster_id'].unique():
                cluster_nodes = clustered_nodes[clustered_nodes['cluster_id'] == cid]
                station_counts = Counter(cluster_nodes['police_station'])
                purity_sum += station_counts.most_common(1)[0][1]
            dbscan_purity = purity_sum / len(clustered_nodes)
            hotspot_coverage = (clustered_nodes['total_violations'].sum() / nodes_df['total_violations'].sum() * 100.0)

    # Output comparative evaluation report text
    report = []
    report.append("=========================================================================")
    report.append("                      ATLAS AI SYSTEM EVALUATION REPORT")
    report.append("=========================================================================\n")
    report.append(f"Evaluated Nodes        : {num_nodes} segments")
    report.append(f"Test Split Date        : March 1, 2024")
    report.append(f"Test Shifts Evaluated  : {len(test_shifts)}\n")
    
    report.append("1. COMPARATIVE BASESLINE METRICS")
    report.append("-" * 73)
    report.append(f"{'Model Configuration':<24} | {'F1':<5} | {'Prec@10':<7} | {'MAE':<6} | {'RMSE':<6}")
    report.append("-" * 73)
    for _, row in comparison_df.iterrows():
        report.append(f"{row['Model Family']:<24} | {row['F1-Score']:.3f} | {row['Precision@10']*100:02.0f}%    | {row['MAE']:.3f} | {row['RMSE']:.3f}")
    report.append("-" * 73 + "\n")
    
    report.append("2. STRATIFIED EDGE-CASE METRICS (ST-GAT HYBRID MODEL)")
    report.append("-" * 73)
    report.append(f"{'Condition Set':<24} | {'F1':<5} | {'Prec@10':<7} | {'MAE':<6} | {'RMSE':<6}")
    report.append("-" * 73)
    for cat in ["normal", "holiday", "rain"]:
        metrics = strat_metrics[cat]
        report.append(f"{cat.capitalize():<24} | {metrics[0]:.3f} | {metrics[1]*100:02.0f}%    | {metrics[3]:.3f} | {metrics[4]:.3f}")
    report.append("-" * 73 + "\n")
    
    report.append("3. OPERATIONAL DISPATCH SAVINGS (TOP 10 RECOMMENDED ZONES)")
    report.append("-" * 73)
    report.append(f"  Est. Commuter Delay Savings      : ~{int(np.round(est_reduction_hours/10)*10)} vehicle-hours saved per hour")
    report.append(f"  Avg. Recovered Road Capacity     : ~{avg_capacity_recovered:.1f}% capacity increase")
    report.append(f"  DBSCAN Jurisdiction Cluster Purity: {dbscan_purity*100:.1f}%")
    report.append(f"  Hotspot Violation Volume Coverage: {hotspot_coverage:.1f}%")
    report.append("=========================================================================")
    
    report_text = "\n".join(report)
    with open(os.path.join(output_dir, "evaluation_metrics_report.txt"), "w", encoding="utf-8") as f:
        f.write(report_text)
        
    print(report_text)
    print(f"\nModel evaluation metrics generated! Report saved to: {output_dir}/evaluation_metrics_report.txt")
    return report_text

if __name__ == "__main__":
    raw_csv = "output/temp_cleaned_violations.csv"
    nodes_csv = "output/graph_nodes.csv"
    edges_json = "output/graph_edges.json"
    
    if os.path.exists(raw_csv) and os.path.exists(nodes_csv) and os.path.exists(edges_json):
        run_system_evaluation(raw_csv, nodes_csv, edges_json, log_transform=True)
    else:
        print("Required CSV/JSON files not found. Ensure pipeline and graph construction have run.")

