#!/bin/sh
# Exit immediately if a command exits with a non-zero status
set -e

echo "[Atlas GNN Engine] Starting raw traffic citation pre-processing..."
python src/data_pipeline.py

echo "[Atlas GNN Engine] Building road network and coordinate snapping..."
python src/road_network.py

echo "[Atlas GNN Engine] Training spatiotemporal GNN (ST-GATv2) and spatial-lag XGBoost..."
python src/train.py

echo "[Atlas GNN Engine] Performing GIS DBSCAN spatial clustering on hotspots..."
python src/gis_layer.py

echo "[Atlas GNN Engine] Running ILP Optimizer (MILP) to generate dispatch recommendations..."
python src/recommendation_engine.py

echo "[Atlas GNN Engine] Pipeline execution successfully completed. Outputs updated in output/ directory."
