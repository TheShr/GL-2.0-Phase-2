import os
import sys
import torch

# Add src to python path
sys.path.append(os.path.join(os.path.dirname(__file__)))

from data_pipeline import load_and_clean_data
from road_network import construct_graph
from model import STGATModel
from gis_layer import analyze_spatial_hotspots
from recommendation_engine import generate_enforcement_recommendations

def test_pipeline_and_graph():
    print("\n--- Testing Data Pipeline and Graph Construction ---")
    current_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.abspath(os.path.join(current_dir, "..", "dataset", "jan to may police violation_anonymized791b166.csv.gz"))
    if not os.path.exists(csv_path):
        csv_path = os.path.abspath(os.path.join(current_dir, "..", "dataset", "jan to may police violation_anonymized791b166.csv"))
    if not os.path.exists(csv_path):
        csv_path = r"c:\Users\anujs\OneDrive\Desktop\GridLock Phase 2\backend\dataset\jan to may police violation_anonymized791b166.csv"
    
    # We will test using a small subset (first 10,000 lines) to execute fast
    print("Reading first 10,000 rows for verification...")
    df_subset = pd.read_csv(csv_path, nrows=10000)
    
    # Run pipeline operations manually on subset
    df_subset = df_subset[df_subset['validation_status'] != 'rejected']
    df_subset['created_datetime'] = pd.to_datetime(df_subset['created_datetime'], errors='coerce')
    df_subset = df_subset.dropna(subset=['created_datetime'])
    df_subset['created_ist'] = df_subset['created_datetime'].dt.tz_convert('Asia/Kolkata')
    df_subset['hour'] = df_subset['created_ist'].dt.hour
    df_subset['dayofweek'] = df_subset['created_ist'].dt.dayofweek
    df_subset['month'] = df_subset['created_ist'].dt.month
    df_subset['date'] = df_subset['created_ist'].dt.date
    
    import numpy as np
    df_subset['hour_sin'] = np.sin(2 * np.pi * df_subset['hour'] / 24.0)
    df_subset['hour_cos'] = np.cos(2 * np.pi * df_subset['hour'] / 24.0)
    df_subset['dow_sin'] = np.sin(2 * np.pi * df_subset['dayofweek'] / 7.0)
    df_subset['dow_cos'] = np.cos(2 * np.pi * df_subset['dayofweek'] / 7.0)
    
    temp_subset_path = "output/test_cleaned_subset.csv"
    os.makedirs("output", exist_ok=True)
    df_subset.to_csv(temp_subset_path, index=False)
    print("Pipeline subset saved. Running graph construction on subset...")
    
    nodes_df, edges = construct_graph(temp_subset_path, output_dir="output/test_output")
    print(f"Graph constructed. Generated {len(nodes_df)} nodes and {len(edges)} edges.")
    assert len(nodes_df) > 0, "No nodes generated."
    print("Data pipeline and graph construction check: PASSED")

def test_model():
    print("\n--- Testing ST-GAT Neural Network ---")
    # Define model configurations
    num_nodes = 10
    in_features = 8
    seq_len = 6
    batch_size = 4
    
    # Initialize random inputs
    x = torch.randn(batch_size, seq_len, num_nodes, in_features)
    # 2x20 matrix representing 20 directed edges between 10 nodes
    edges = torch.randint(0, num_nodes, (2, 20), dtype=torch.long)
    
    # Instantiate STGAT
    model = STGATModel(num_nodes=num_nodes, in_features=in_features,
                       spatial_hidden=16, temporal_hidden=8)
    
    risk = model(x, edges)
    print("Model Output risk shape:", risk.shape)
    assert risk.shape == (batch_size, num_nodes), "Risk shape mismatch."
    print("PyTorch ST-GAT Model check: PASSED")

def test_gis_and_recommendations():
    print("\n--- Testing GIS Clustering and Recommendations ---")
    nodes_csv = "output/graph_nodes.csv"
    
    if os.path.exists(nodes_csv):
        print("Clustering real nodes...")
        df_clustered, clusters_df = analyze_spatial_hotspots(nodes_csv, output_dir="output/test_output")
        assert len(clusters_df) > 0, "No hotspot clusters discovered."
        
        print("Running recommendation engine on clustered hotspots...")
        recs_df = generate_enforcement_recommendations("output/test_output/hotspot_clusters.csv", 
                                                       output_dir="output/test_output")
        assert len(recs_df) > 0, "No recommendations generated."
        print("GIS Clustering and Recommendation engine check: PASSED")
    else:
        print("Real graph_nodes.csv not found, skipping GIS check (run main first).")

def test_dispatcher():
    print("\n--- Testing ILP Patrol Optimizer ---")
    from dispatcher import PatrolAllocationOptimizer
    optimizer = PatrolAllocationOptimizer()
    
    hotspots = [
        {
            "hotspot_id": 1,
            "hotspot_name": "Junction A",
            "predicted_risk": 0.8,
            "commuter_delay_savings": 500.0,
            "logistics_penalty_index": 2.0,
            "officers_required": 2,
            "police_station": "Station A"
        }
    ]
    constraints = {
        "total_available_officers": 2,
        "max_officers_per_hotspot": 2,
        "max_deployments_per_station": {"Station A": 2}
    }
    
    res = optimizer.solve(hotspots, constraints)
    assert res["status"] == "success", "ILP Solver failed basic solve test."
    assert res["total_officers_allocated"] == 2, "Solver failed to allocate expected units."
    print("ILP Dispatcher Solver check: PASSED")

if __name__ == "__main__":
    import pandas as pd
    print("Starting automated system tests...")
    try:
        test_pipeline_and_graph()
        test_model()
        test_gis_and_recommendations()
        test_dispatcher()
        print("\nAll automated integration tests PASSED successfully!")
    except Exception as e:
        print(f"\nTest Execution FAILED with error: {str(e)}")
        sys.exit(1)
