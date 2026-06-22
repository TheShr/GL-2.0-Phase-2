import sys
# Mask transformers to prevent PyTorch/ONNX from importing it and crashing on version mismatches
sys.modules['transformers'] = None

import os
import pandas as pd
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
import json
import time

from model import STGATModel

def weighted_huber_loss(pred, target, weights, deltas=1.0):
    """
    Computes a weighted Huber loss with node-specific deltas.
    pred: [batch_size, num_nodes]
    target: [batch_size, num_nodes]
    weights: [num_nodes] - node-specific loss weights
    deltas: [num_nodes] or float - node-specific deltas
    """
    error = torch.abs(pred - target)
    if isinstance(deltas, torch.Tensor):
        deltas = deltas.unsqueeze(0)  # broadcast over batch dimension
    huber_mask = error <= deltas
    quadratic = 0.5 * (error ** 2)
    linear = deltas * (error - 0.5 * deltas)
    loss = torch.where(huber_mask, quadratic, linear)
    
    # Apply node-specific weights
    weighted_loss = loss * weights.unsqueeze(0)  # broadcast over batch dimension
    return weighted_loss.mean()

def prepare_spatiotemporal_data(cleaned_csv_path, nodes_csv_path, edges_json_path, log_transform=False):
    print("Preparing spatio-temporal tensors for ST-GAT training...")
    df = pd.read_csv(cleaned_csv_path)
    nodes_df = pd.read_csv(nodes_csv_path)
    
    with open(edges_json_path, 'r') as f:
        edges_data = json.load(f)
        
    # Convert created_ist to datetime
    df['created_ist'] = pd.to_datetime(df['created_ist'], format='mixed')
    
    # 1. Setup Time shifts
    # We bin violations into 4-hour windows (6 shifts per day)
    # Shift index is calculated from start of data
    start_time = df['created_ist'].min()
    df['shift_idx'] = ((df['created_ist'] - start_time).dt.total_seconds() / (4 * 3600)).astype(int)
    max_shift = df['shift_idx'].max()
    num_shifts = max_shift + 1
    
    # Calculate node_id by snapping coordinates to nearest predefined corridor node
    from road_network import snap_coordinates
    df['node_id'], df['snap_dist'] = snap_coordinates(df['latitude'].values, df['longitude'].values)
    df = df[df['snap_dist'] <= 0.04]
    
    num_nodes = len(nodes_df)
    node_to_idx = {nid: i for i, nid in enumerate(nodes_df['node_id'])}
    df['node_idx'] = df['node_id'].map(node_to_idx)
    # Drop rows that were filtered out of node list (noise nodes)
    df = df.dropna(subset=['node_idx'])
    df['node_idx'] = df['node_idx'].astype(int)
    
    print(f"Graph nodes: {num_nodes} | Total Temporal Shifts: {num_shifts}")
    
    # 2. Extract vehicle categories
    df['is_car'] = (df['vehicle_type'].isin(['CAR', 'VAN', 'JEEP'])).astype(float)
    df['is_two_wheeler'] = (df['vehicle_type'].isin(['SCOOTER', 'MOTOR CYCLE', 'MOPED'])).astype(float)
    df['is_auto'] = (df['vehicle_type'].isin(['PASSENGER AUTO', 'GOODS AUTO'])).astype(float)
    
    # Weight index for capacity reduction calculation
    vehicle_weights = {
        'SCOOTER': 0.15, 'MOTOR CYCLE': 0.15, 'MOPED': 0.15,
        'PASSENGER AUTO': 0.30, 'GOODS AUTO': 0.30,
        'CAR': 0.50, 'JEEP': 0.50, 'VAN': 0.50, 'TEMPO': 0.70,
        'MAXI-CAB': 0.70, 'LGV': 0.70, 'MINI LORRY': 0.70,
        'PRIVATE BUS': 1.00, 'BUS (BMTC/KSRTC)': 1.00, 'TOURIST BUS': 1.00
    }
    df['cap_weight'] = df['vehicle_type'].map(vehicle_weights).fillna(0.3)

    # 3. Create feature tensor: [num_shifts, num_nodes, num_features]
    num_features = 14
    spatial_temporal_grid = np.zeros((num_shifts, num_nodes, num_features + 1))
    
    # Pre-populate cyclical temporal features per shift
    print("Populating temporal and static features...")
    for s in range(num_shifts):
        shift_time = start_time + pd.Timedelta(seconds=s * 4 * 3600)
        hour = shift_time.hour
        dow = shift_time.dayofweek
        
        spatial_temporal_grid[s, :, 0] = np.sin(2 * np.pi * hour / 24.0)
        spatial_temporal_grid[s, :, 1] = np.cos(2 * np.pi * hour / 24.0)
        spatial_temporal_grid[s, :, 2] = np.sin(2 * np.pi * dow / 7.0)
        spatial_temporal_grid[s, :, 3] = np.cos(2 * np.pi * dow / 7.0)
        
        # Populate static road attributes and POI densities
        spatial_temporal_grid[s, :, 8] = nodes_df['commercial_density'].values
        spatial_temporal_grid[s, :, 9] = nodes_df['transit_density'].values
        spatial_temporal_grid[s, :, 10] = nodes_df['dining_density'].values
        spatial_temporal_grid[s, :, 11] = nodes_df['corporate_density'].values
        spatial_temporal_grid[s, :, 12] = nodes_df['vulnerability_index'].values
        spatial_temporal_grid[s, :, 13] = nodes_df['lanes'].values / 4.0

    # Populate spatial-temporal violation metrics
    print("Aggregating violations into grids...")
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
        # Scale features to keep inputs around [0, 1] range
        spatial_temporal_grid[s, n, 4] = row['scooter_count'] / 10.0
        spatial_temporal_grid[s, n, 5] = row['car_count'] / 10.0
        spatial_temporal_grid[s, n, 6] = row['auto_count'] / 10.0
        spatial_temporal_grid[s, n, 7] = row['total_count'] / 20.0
        spatial_temporal_grid[s, n, 14] = row['capacity_loss'] # Target Cap Loss

    # 4. Map edges JSON to PyTorch long tensor: [2, num_edges]
    print("Mapping graph edges index...")
    edge_sources = []
    edge_targets = []
    for edge in edges_data:
        # Map source/target node IDs to indices
        src_idx = node_to_idx.get(edge['source'])
        tgt_idx = node_to_idx.get(edge['target'])
        if src_idx is not None and tgt_idx is not None:
            edge_sources.append(src_idx)
            edge_targets.append(tgt_idx)
            
    edge_index = torch.tensor([edge_sources, edge_targets], dtype=torch.long)
    
    # 5. Build sliding window sequences
    # Sequence length = 6 (representing last 24 hours of history)
    seq_len = 6
    X = []
    Y_risk = []
    
    print("Slicing temporal sequences...")
    for t in range(num_shifts - seq_len):
        # Input sequence: shape [seq_len, num_nodes, num_features]
        x_seq = spatial_temporal_grid[t : t + seq_len, :, :num_features]
        
        # Target step: t + seq_len
        # Normalise risk target by max scale of 20 violations per shift
        target_violations = spatial_temporal_grid[t + seq_len, :, 7]
        target_risk = np.clip(target_violations / 20.0, 0, 1)
        
        # Apply target log-transformation if enabled
        if log_transform:
            target_risk = np.log1p(target_risk)
        
        X.append(x_seq)
        Y_risk.append(target_risk)
        
    X = torch.tensor(np.array(X), dtype=torch.float32)
    Y_risk = torch.tensor(np.array(Y_risk), dtype=torch.float32)
    
    return X, Y_risk, edge_index, num_nodes, num_features, nodes_df

def build_spatial_lag_features(X_tensor, edge_index, nodes_df):
    """
    Engineers spatial lag features for XGBoost baseline.
    X_tensor: [batch_size, seq_len, num_nodes, num_features]
    edge_index: [2, num_edges]
    nodes_df: DataFrame of nodes with latitude and longitude
    Returns: numpy array of shape [batch_size * num_nodes, num_features + 3]
    """
    num_seq = X_tensor.size(0)
    num_nodes = len(nodes_df)
    
    # Extract node coordinates for distance weighting
    lats = nodes_df['latitude'].values
    lons = nodes_df['longitude'].values
    
    # Distance matrix D
    D = np.sqrt((lats[:, None] - lats[None, :])**2 + (lons[:, None] - lons[None, :])**2)
    W = 1.0 / (D + 1e-4)
    np.fill_diagonal(W, 0.0)
    
    # Adjacency list from edge_index
    adj_list = {i: [] for i in range(num_nodes)}
    edge_index_np = edge_index.cpu().numpy()
    for col in range(edge_index_np.shape[1]):
        u = int(edge_index_np[0, col])
        v = int(edge_index_np[1, col])
        adj_list[u].append(v)
        
    # Precompute 2nd-order neighbors
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
                    
    # Precompute 1st-order and 2nd-order transition matrices
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
            
    W_sum = W.sum(axis=1, keepdims=True)
    W_norm = np.where(W_sum > 0, W / W_sum, 0.0)

    # Convert X_tensor to numpy and compute means over sequence length dimension (axis=1)
    X_np = X_tensor.numpy()
    # own_feats_all shape: [num_seq, num_nodes, num_features]
    own_feats_all = X_np.mean(axis=1)
    
    # viols_all shape: [num_seq, num_nodes]
    viols_all = X_np[:, :, :, 7].mean(axis=1)
    
    # Vectorized lags calculation
    # lag_1_all shape: [num_seq, num_nodes]
    lag_1_all = viols_all @ A_1st.T
    # lag_2_all shape: [num_seq, num_nodes]
    lag_2_all = viols_all @ A_2nd.T
    # lag_dist_all shape: [num_seq, num_nodes]
    lag_dist_all = viols_all @ W_norm.T
    
    # Add new axis to lags to match own_feats_all dimensions
    lag_1_all = lag_1_all[:, :, np.newaxis]
    lag_2_all = lag_2_all[:, :, np.newaxis]
    lag_dist_all = lag_dist_all[:, :, np.newaxis]
    
    # Concatenate features: own_feats_all + lags
    # result shape: [num_seq, num_nodes, num_features + 3]
    features_all = np.concatenate([own_feats_all, lag_1_all, lag_2_all, lag_dist_all], axis=-1)
    
    # Flatten to [num_seq * num_nodes, num_features + 3]
    return features_all.reshape(num_seq * num_nodes, -1)

def train_xgboost_fallback_model(X_train, Y_train, X_val, Y_val, edge_index, nodes_df):
    print("\n--- Training XGBoost Spatial Lag Fallback Model ---")
    X_train_tab = build_spatial_lag_features(X_train, edge_index, nodes_df)
    Y_train_tab = Y_train.numpy().flatten()
    X_val_tab = build_spatial_lag_features(X_val, edge_index, nodes_df)
    Y_val_tab = Y_val.numpy().flatten()
    
    from xgboost import XGBRegressor
    xgb = XGBRegressor(n_estimators=100, learning_rate=0.05, max_depth=6, random_state=42)
    xgb.fit(X_train_tab, Y_train_tab, eval_set=[(X_val_tab, Y_val_tab)], verbose=False)
    
    xgb_path = "output/xgboost_fallback.json"
    xgb.save_model(xgb_path)
    print(f"XGBoost fallback model trained and saved to: {xgb_path}")
    return xgb

def run_inference_pipeline(stgat_model, xgb_model, X, edge_index, nodes_df, num_nodes, num_features):
    print("\n--- Running Inference Pipeline for Next Shift Risk Forecast ---")
    stgat_model.eval()
    
    # Take the very last sequence in our dataset to forecast the next shift
    last_x_seq = X[-1:] # shape [1, seq_len, num_nodes, num_features]
    
    # 1. GNN Inference
    with torch.no_grad():
        gnn_risk_tensor = stgat_model(last_x_seq, edge_index).squeeze(0) # shape [num_nodes]
        # Auto-detect log_transform and inverse-transform predictions back to [0, 1] range
        if getattr(stgat_model, 'log_transform', False):
            gnn_risk_tensor = torch.expm1(gnn_risk_tensor)
        gnn_risk = gnn_risk_tensor.cpu().numpy()
        
    # 2. XGBoost Inference (with spatial lags)
    last_x_seq_tab = build_spatial_lag_features(last_x_seq, edge_index, nodes_df)
    
    xgb_risk = xgb_model.predict(last_x_seq_tab) # shape [num_nodes]
    # Auto-detect log_transform and inverse-transform fallback predictions back to [0, 1] range
    if getattr(stgat_model, 'log_transform', False):
        xgb_risk = np.expm1(xgb_risk)
    
    # 3. Hybrid Combination (60% GNN + 40% XGBoost)
    hybrid_risk = 0.6 * gnn_risk + 0.4 * xgb_risk
    hybrid_risk = np.clip(hybrid_risk, 0.0, 1.0)
    
    # Write back predicted risk values to nodes_df
    nodes_df['predicted_risk'] = hybrid_risk
    nodes_df['stgat_risk'] = np.clip(gnn_risk, 0.0, 1.0)
    nodes_df['xgboost_risk'] = np.clip(xgb_risk, 0.0, 1.0)
    
    # Save to graph_nodes.csv
    nodes_df.to_csv("output/graph_nodes.csv", index=False)
    print("Next shift predicted risk scores calculated and written to output/graph_nodes.csv")
 
def train_model(epochs=5, batch_size=8, log_transform=True, tuned=True):
    cleaned_csv = "output/graph_nodes.csv"
    raw_csv = "output/temp_cleaned_violations.csv"
    edges_json = "output/graph_edges.json"
    
    if not (os.path.exists(cleaned_csv) and os.path.exists(edges_json)):
        print("Required graph files not found. Run pipeline and road_network scripts first.")
        return
        
    # 1. Prepare data tensors (applying target log-transform if enabled)
    X, Y_risk, edge_index, num_nodes, num_features, nodes_df = prepare_spatiotemporal_data(
        raw_csv, cleaned_csv, edges_json, log_transform=log_transform
    )
    
    print(f"Tensors constructed successfully.")
    print(f"X shape (sequences): {X.shape}")
    print(f"Y_risk shape        : {Y_risk.shape}")
    print(f"Edge Index shape    : {edge_index.shape}")
    
    # 2. Temporal Train/Test split indices
    num_sequences = X.size(0)
    split_idx = int(num_sequences * 0.8)
    
    X_train, Y_risk_train = X[:split_idx], Y_risk[:split_idx]
    X_val, Y_risk_val = X[split_idx:], Y_risk[split_idx:]
    
    # 3. Instantiate model with capacity corresponding to baseline vs tuned configuration
    spatial_dim = 64 if tuned else 16
    temporal_dim = 32 if tuned else 8
    print(f"\nInstantiating ST-GAT Model (tuned={tuned}, spatial_hidden={spatial_dim}, temporal_hidden={temporal_dim})...")
    
    model = STGATModel(
        num_nodes=num_nodes,
        in_features=num_features,
        spatial_hidden=spatial_dim,
        temporal_hidden=temporal_dim,
        log_transform=log_transform
    )
    
    # Use native PyTorch Adam optimizer with L2 weight decay regularization
    optimizer = optim.Adam(model.parameters(), lr=0.005, weight_decay=1e-4)
    
    # Compute node loss weights based on corporate/transit density and historical violation volumes (log-scaled prior)
    corp_dens = torch.tensor(nodes_df['corporate_density'].values, dtype=torch.float32)
    trans_dens = torch.tensor(nodes_df['transit_density'].values, dtype=torch.float32)
    hist_vols = torch.tensor(np.log1p(nodes_df['total_violations'].values), dtype=torch.float32)
    # Combined loss weights to prioritize both high POI density zones and high-volume transport corridors
    node_weights = (1.0 + 2.0 * (corp_dens + trans_dens) + 0.3 * hist_vols).to(X.device)
    
    # Node-specific deltas: high-density commercial hubs get higher delta (up to 5.0) to prioritize spike magnitudes
    node_deltas = (1.0 + 4.0 * (corp_dens + trans_dens)).to(X.device)
    
    # 4. Training Loop
    print("Starting Model Training...")
    print(f"Epochs: {epochs} | Batch Size: {batch_size}")
    
    for epoch in range(epochs):
        model.train()
        epoch_loss = 0.0
        start_epoch = time.time()
        
        indices = torch.randperm(X_train.size(0))
        num_batches = int(np.ceil(X_train.size(0) / batch_size))
        
        for b in range(num_batches):
            batch_indices = indices[b * batch_size : (b + 1) * batch_size]
            if len(batch_indices) == 0:
                continue
                
            x_b = X_train[batch_indices]
            y_risk_b = Y_risk_train[batch_indices]
            
            optimizer.zero_grad()
            risk_pred = model(x_b, edge_index)
            # Map predictions and targets to raw violations scale [0, 20] to apply physical deltas
            if log_transform:
                risk_pred_raw = torch.expm1(risk_pred) * 20.0
                y_risk_b_raw = torch.expm1(y_risk_b) * 20.0
            else:
                risk_pred_raw = risk_pred * 20.0
                y_risk_b_raw = y_risk_b * 20.0
            
            # Use Weighted Huber Loss with node-specific deltas on raw violations scale
            loss = weighted_huber_loss(risk_pred_raw, y_risk_b_raw, node_weights, deltas=node_deltas)
            
            # If tuned, apply entropy regularization on the adaptive adjacency matrix to prevent collapse / sparsity overfitting
            if tuned:
                A_adaptive = model.last_A_adaptive
                entropy_loss = -0.01 * torch.sum(A_adaptive * torch.log(A_adaptive + 1e-12)) / model.num_nodes
                loss = loss + entropy_loss
                
            loss.backward()
            optimizer.step()
            
            # Track epoch loss on raw scale
            epoch_loss += loss.item() * len(batch_indices)
            
        avg_train_loss = epoch_loss / X_train.size(0)
        
        # Validation Pass
        model.eval()
        val_loss = 0.0
        with torch.no_grad():
            num_val_batches = int(np.ceil(X_val.size(0) / batch_size))
            for b in range(num_val_batches):
                x_val_b = X_val[b * batch_size : (b+1) * batch_size]
                y_risk_val_b = Y_risk_val[b * batch_size : (b+1) * batch_size]
                
                if len(x_val_b) == 0:
                    continue
                    
                val_risk = model(x_val_b, edge_index)
                # Map validation predictions and targets to raw violations scale [0, 20]
                if log_transform:
                    val_risk_raw = torch.expm1(val_risk) * 20.0
                    y_risk_val_b_raw = torch.expm1(y_risk_val_b) * 20.0
                else:
                    val_risk_raw = val_risk * 20.0
                    y_risk_val_b_raw = y_risk_val_b * 20.0
                
                loss_v = weighted_huber_loss(val_risk_raw, y_risk_val_b_raw, node_weights, deltas=node_deltas)
                val_loss += loss_v.item() * len(x_val_b)
                
        avg_val_loss = val_loss / X_val.size(0)
        duration = time.time() - start_epoch
        print(f"Epoch {epoch+1:02d}/{epochs:02d} | Train Loss: {avg_train_loss:.5f} | Val Loss: {avg_val_loss:.5f} | Duration: {duration:.1f}s")
        
    # 5. Save model weights
    os.makedirs("output", exist_ok=True)
    if tuned:
        torch.save(model.state_dict(), "output/stgat_tuned.pt")
        torch.save(model.state_dict(), "output/stgat_model.pt")  # Primary checkpoint used by frontend
        print(f"\nTuned model training complete! Weights saved successfully to output/stgat_tuned.pt and output/stgat_model.pt")
    else:
        torch.save(model.state_dict(), "output/stgat_baseline.pt")
        print(f"\nBaseline model training complete! Weights saved successfully to output/stgat_baseline.pt")
    
    # 6. Train XGBoost Fallback Model (incorporating spatial lags)
    xgb_model = train_xgboost_fallback_model(X_train, Y_risk_train, X_val, Y_risk_val, edge_index, nodes_df)
    
    # 7. Run Inference to update graph nodes predicted risk
    if tuned:
        run_inference_pipeline(model, xgb_model, X, edge_index, nodes_df, num_nodes, num_features)
 
if __name__ == "__main__":
    # Train both baseline and tuned models to support evaluation comparison
    print("=== Training ST-GAT Baseline Model ===")
    train_model(epochs=12, batch_size=8, log_transform=True, tuned=False)
    print("\n=== Training ST-GAT Tuned Model ===")
    train_model(epochs=12, batch_size=8, log_transform=True, tuned=True)
