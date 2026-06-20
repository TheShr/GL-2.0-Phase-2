import os
import pandas as pd
import numpy as np
from sklearn.cluster import DBSCAN

def analyze_spatial_hotspots(nodes_csv_path, output_dir="output"):
    print("Loading graph nodes for GIS spatial analysis...")
    df = pd.read_csv(nodes_csv_path)
    
    # 1. Run DBSCAN to group adjacent active road nodes
    # eps=0.002 degrees is approximately 220 meters.
    # min_samples=3 means a cluster must have at least 3 active nodes.
    print("Running DBSCAN spatial density clustering...")
    coords = df[['latitude', 'longitude']].values
    
    # We use euclidean distance on degrees as a local flat-plane approximation
    db = DBSCAN(eps=0.002, min_samples=3).fit(coords)
    df['cluster_id'] = db.labels_

    # Calculate cluster statistics
    n_clusters = len(set(db.labels_)) - (1 if -1 in db.labels_ else 0)
    n_noise = list(db.labels_).count(-1)
    print(f"Discovered {n_clusters} spatial hotspot clusters. Noise nodes (outliers): {n_noise}.")

    # 2. Extract cluster centroids and aggregate characteristics
    print("Aggregating hotspot characteristics...")
    clusters_summary = []
    
    for cid in set(db.labels_):
        if cid == -1:
            continue # Skip noise
            
        c_nodes = df[df['cluster_id'] == cid]
        centroid_lat = c_nodes['latitude'].mean()
        centroid_lon = c_nodes['longitude'].mean()
        total_violations = c_nodes['total_violations'].sum()
        total_capacity_loss = c_nodes['weighted_capacity_reduction'].sum()
        
        # Get dominant police station in this cluster
        dom_station = c_nodes['police_station'].mode().iloc[0] if not c_nodes['police_station'].mode().empty else "Unknown"
        
        # Aggregate new physical features
        dom_road = c_nodes['road_name'].mode().iloc[0] if 'road_name' in c_nodes.columns and not c_nodes['road_name'].mode().empty else "Unknown Road"
        dom_lanes = int(c_nodes['lanes'].mode().iloc[0]) if 'lanes' in c_nodes.columns and not c_nodes['lanes'].mode().empty else 2
        avg_vi = float(c_nodes['vulnerability_index'].mean()) if 'vulnerability_index' in c_nodes.columns else 1.0
        avg_risk = float(c_nodes['predicted_risk'].mean()) if 'predicted_risk' in c_nodes.columns else 1.0
        avg_slope = float(c_nodes['slope'].abs().mean()) if 'slope' in c_nodes.columns else 0.0
        avg_comm = float(c_nodes['commercial_density'].mean()) if 'commercial_density' in c_nodes.columns else 0.0
        avg_trans = float(c_nodes['transit_density'].mean()) if 'transit_density' in c_nodes.columns else 0.0
        avg_dining = float(c_nodes['dining_density'].mean()) if 'dining_density' in c_nodes.columns else 0.0
        avg_corp = float(c_nodes['corporate_density'].mean()) if 'corporate_density' in c_nodes.columns else 0.0
        avg_elev = float(c_nodes['elevation'].mean()) if 'elevation' in c_nodes.columns else 900.0
        
        clusters_summary.append({
            'cluster_id': int(cid),
            'centroid_lat': float(centroid_lat),
            'centroid_lon': float(centroid_lon),
            'total_violations': int(total_violations),
            'total_capacity_loss': float(total_capacity_loss),
            'num_nodes': len(c_nodes),
            'primary_police_station': dom_station,
            'road_name': dom_road,
            'lanes': dom_lanes,
            'vulnerability_index': avg_vi,
            'predicted_risk': avg_risk,
            'slope': avg_slope,
            'commercial_density': avg_comm,
            'transit_density': avg_trans,
            'dining_density': avg_dining,
            'corporate_density': avg_corp,
            'elevation': avg_elev
        })

    clusters_df = pd.DataFrame(clusters_summary)
    # Rank hotspots by a composite score: 60% violations volume + 40% capacity loss impact
    if not clusters_df.empty:
        clusters_df['priority_score'] = (
            (clusters_df['total_violations'] / clusters_df['total_violations'].max() * 0.6) +
            (clusters_df['total_capacity_loss'] / clusters_df['total_capacity_loss'].max() * 0.4)
        )
        clusters_df = clusters_df.sort_values(by='priority_score', ascending=False).reset_index(drop=True)
    
    # 3. Save outputs
    df.to_csv(f"{output_dir}/nodes_with_clusters.csv", index=False)
    if not clusters_df.empty:
        clusters_df.to_csv(f"{output_dir}/hotspot_clusters.csv", index=False)
        
    print("\n=== TOP 10 DETECTED ILLEGAL PARKING HOTSPOTS ===")
    if not clusters_df.empty:
        for idx, row in clusters_df.head(10).iterrows():
            print(f"Rank {idx+1}: Cluster {row['cluster_id']} in {row['primary_police_station']} "
                  f"| Nodes: {row['num_nodes']} | Violations: {row['total_violations']} "
                  f"| Centroid: ({row['centroid_lat']:.4f}, {row['centroid_lon']:.4f})")
    else:
        print("No clusters found.")
        
    return df, clusters_df

if __name__ == "__main__":
    nodes_csv = "output/graph_nodes.csv"
    if os.path.exists(nodes_csv):
        analyze_spatial_hotspots(nodes_csv)
    else:
        print(f"Error: {nodes_csv} not found. Please run road_network.py first.")
