import os
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

# Set style for professional PPT slides
sns.set_theme(style="whitegrid")
plt.rcParams.update({
    "font.family": "sans-serif",
    "font.size": 11,
    "axes.labelsize": 12,
    "axes.titlesize": 14,
    "xtick.labelsize": 10,
    "ytick.labelsize": 10,
    "figure.titlesize": 16,
    "figure.dpi": 300,
    "savefig.dpi": 300,
    "savefig.bbox": "tight"
})

# Define output directory
OUTPUT_DIR = r"c:\Users\anujs\OneDrive\Desktop\GridLock Phase 2\output\plots"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Color palettes
PRIMARY_BLUE = "#1E40AF"      # Slate blue
ACCENT_CYAN = "#06B6D4"       # Cyan
ACCENT_AMBER = "#F59E0B"      # Amber
CRITICAL_RED = "#EF4444"      # Red
SUCCESS_EMERALD = "#10B981"   # Emerald
CHARCOAL = "#334155"          # Charcoal text

def plot_model_comparison():
    """Generates comparison bar charts between baselines and our ST-GATv2 model."""
    models = ["Historical Avg", "XGBoost (Basic)", "ST-GATv2 (Baseline)", "ST-GATv2 (Tuned)"]
    f1_scores = [0.632, 0.521, 0.697, 0.697]
    mae_errors = [2.10, 1.80, 1.027, 0.892]
    
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))
    
    # 1. F1 Score Plot
    colors_f1 = [CHARCOAL, CHARCOAL, PRIMARY_BLUE, SUCCESS_EMERALD]
    bars_f1 = ax1.bar(models, f1_scores, color=colors_f1, width=0.55, edgecolor="none", alpha=0.9)
    ax1.set_title("Hotspot Detection Performance (F1-Score)\n[Higher is Better]", pad=15, fontweight="bold", color=CHARCOAL)
    ax1.set_ylabel("F1-Score", fontweight="semibold")
    ax1.set_ylim(0, 0.85)
    
    for bar in bars_f1:
        height = bar.get_height()
        ax1.text(bar.get_x() + bar.get_width()/2., height + 0.02, f"{height:.3f}", 
                 ha="center", va="bottom", fontsize=10, fontweight="bold", color=CHARCOAL)
                 
    # 2. MAE Plot
    colors_mae = [CHARCOAL, CHARCOAL, PRIMARY_BLUE, SUCCESS_EMERALD]
    bars_mae = ax2.bar(models, mae_errors, color=colors_mae, width=0.55, edgecolor="none", alpha=0.9)
    ax2.set_title("Violation Forecasting Error (MAE/shift/node)\n[Lower is Better]", pad=15, fontweight="bold", color=CHARCOAL)
    ax2.set_ylabel("MAE (Violations)", fontweight="semibold")
    ax2.set_ylim(0, 2.5)
    
    for bar in bars_mae:
        height = bar.get_height()
        ax2.text(bar.get_x() + bar.get_width()/2., height + 0.05, f"{height:.3f}", 
                 ha="center", va="bottom", fontsize=10, fontweight="bold", color=CHARCOAL)
                 
    plt.tight_layout()
    plot_path = os.path.join(OUTPUT_DIR, "model_performance_comparison.png")
    plt.savefig(plot_path, dpi=300)
    plt.close()
    print(f"Saved: {plot_path}")

def plot_hotspot_clusters():
    """Generates a scatter bubble plot showing spatial hotspot clusters and traffic density."""
    csv_path = r"c:\Users\anujs\OneDrive\Desktop\GridLock Phase 2\backend\output\hotspot_clusters.csv"
    if not os.path.exists(csv_path):
        csv_path = r"c:\Users\anujs\OneDrive\Desktop\GridLock Phase 2\output\hotspot_clusters.csv"
        
    if not os.path.exists(csv_path):
        print("Hotspot clusters CSV not found, skipping map plot.")
        return
        
    df = pd.read_csv(csv_path)
    
    plt.figure(figsize=(10, 8))
    
    # Scale bubble sizes nicely (using log scale to avoid one massive node swallowing everything)
    sizes = np.log1p(df["total_violations"]) * 250
    
    # Map colors based on priority score or total violations
    scatter = plt.scatter(
        df["centroid_lon"], 
        df["centroid_lat"], 
        s=sizes, 
        c=df["priority_score"], 
        cmap="YlOrRd", 
        alpha=0.85, 
        edgecolors="#1E293B", 
        linewidths=1.5
    )
    
    # Add labels
    for idx, row in df.iterrows():
        label = f"{row['primary_police_station']} PS\n({row['total_violations']:,} violations)"
        plt.annotate(
            label, 
            (row["centroid_lon"], row["centroid_lat"]), 
            textcoords="offset points", 
            xytext=(10, 10), 
            ha="left", 
            fontsize=8, 
            fontweight="bold",
            color="#0F172A",
            bbox=dict(boxstyle="round,pad=0.3", fc="white", alpha=0.8, ec="#CBD5E1")
        )
        
    plt.title("Geographic Hotspot Clusters Discovered by DBSCAN\n(Bubble size proportional to total illegal parking violations)", pad=20, fontweight="bold", color=CHARCOAL)
    plt.xlabel("Longitude", fontweight="semibold")
    plt.ylabel("Latitude", fontweight="semibold")
    
    cbar = plt.colorbar(scatter)
    cbar.set_label("ILP Dispatch Priority Score", fontweight="semibold")
    
    plt.grid(True, linestyle="--", alpha=0.5)
    plt.tight_layout()
    plot_path = os.path.join(OUTPUT_DIR, "gis_hotspots_distribution.png")
    plt.savefig(plot_path, dpi=300)
    plt.close()
    print(f"Saved: {plot_path}")

def plot_diurnal_risk():
    """Generates the diurnal curve representing hourly risk indices."""
    hours = np.linspace(6, 22, 100)
    
    # Generate diurnal curves matching typical urban peak profiles (9 AM and 6:30 PM)
    morning_peak = np.exp(-((hours - 9.0) ** 2) / 6.0) * 0.45
    evening_peak = np.exp(-((hours - 18.5) ** 2) / 7.0) * 0.52
    
    # GNN Baseline: Constant spatial-temporal base risk for a major hotspot corridor (e.g. 0.42)
    gnn_baseline = np.zeros_like(hours) + 0.42
    
    # XGBoost Live Override: Highly responsive to diurnal traffic patterns and congestion spikes
    xgboost_risk = 0.15 + morning_peak + evening_peak
    xgboost_risk = np.clip(xgboost_risk, 0.1, 0.95)
    
    # Hybrid Combined Prediction: 0.6 * GNN + 0.4 * XGBoost
    hybrid_risk = 0.6 * gnn_baseline + 0.4 * xgboost_risk
    
    plt.figure(figsize=(10, 5))
    plt.plot(hours, gnn_baseline, label="GNN Baseline (Constant Spatial Base)", color=CHARCOAL, linestyle="--", linewidth=2, alpha=0.8)
    plt.plot(hours, xgboost_risk, label="XGBoost Live Override (Traffic Counts)", color=ACCENT_AMBER, linestyle=":", linewidth=2, alpha=0.9)
    plt.plot(hours, hybrid_risk, label="Blended Hybrid Risk Index (Final Forecast)", color=CRITICAL_RED, linewidth=3)
    
    # Highlight peaks
    plt.axvspan(8, 10.5, color="#EF4444", alpha=0.07, label="Morning Peak Rush")
    plt.axvspan(17, 20, color="#EF4444", alpha=0.07, label="Evening Peak Rush")
    
    plt.title("Diurnal Risk Profile & Live Override Blending Model\n(Demonstrating real-time GNN baseline & XGBoost override fusion)", pad=20, fontweight="bold", color=CHARCOAL)
    plt.xlabel("Hour of the Day (06:00 to 22:00)", fontweight="semibold")
    plt.ylabel("Congestion / Collision Risk Index", fontweight="semibold")
    plt.xlim(6, 22)
    plt.ylim(0, 1.0)
    
    # Format x-ticks as time
    plt.xticks(np.arange(6, 23, 2), [f"{h:02d}:00" for h in np.arange(6, 23, 2)])
    plt.legend(loc="upper left", frameon=True, facecolor="white", edgecolor="#E2E8F0")
    
    plt.tight_layout()
    plot_path = os.path.join(OUTPUT_DIR, "diurnal_risk_profile.png")
    plt.savefig(plot_path, dpi=300)
    plt.close()
    print(f"Saved: {plot_path}")

def plot_mitigation_impact():
    """Generates a visualization of risk reduction and capacity recovery vs. officers deployed."""
    officers = np.arange(0, 7)
    
    # Risk Decay: Risk = Risk_0 * exp(-0.25 * officers)
    initial_risk = 0.72
    risk_profile = initial_risk * np.exp(-0.25 * officers)
    
    # Capacity Recovered (%): mapped from the risk reduction
    capacity_recovered = (initial_risk - risk_profile) * 12.5 # scales up to ~8-9% capacity recovery
    
    fig, ax1 = plt.subplots(figsize=(10, 5))
    
    # Axis 1: Risk Index (Line plot)
    color = CRITICAL_RED
    line1 = ax1.plot(officers, risk_profile, color=color, marker="o", linewidth=2.5, label="Predicted Congestion Risk Index")
    ax1.set_xlabel("Number of Patrol Officers Allocated to Hotspot", fontweight="semibold")
    ax1.set_ylabel("Congestion Risk Index", color=color, fontweight="semibold")
    ax1.tick_params(axis='y', labelcolor=color)
    ax1.set_ylim(0, 0.8)
    
    # Axis 2: Capacity Recovered (Bar plot)
    ax2 = ax1.twinx()
    color = SUCCESS_EMERALD
    bars = ax2.bar(officers, capacity_recovered, color=color, alpha=0.3, width=0.4, label="Recovered Road Capacity (%)")
    ax2.set_ylabel("Recovered Road Capacity (%)", color=color, fontweight="semibold")
    ax2.tick_params(axis='y', labelcolor=color)
    ax2.set_ylim(0, 10.0)
    
    # Annotate bars
    for bar in bars:
        height = bar.get_height()
        if height > 0:
            ax2.text(bar.get_x() + bar.get_width()/2., height - 0.7, f"+{height:.1f}%", 
                     ha="center", va="bottom", fontsize=8, color="#065F46", fontweight="bold")
                     
    # Add title and grid
    plt.title("Macroscopic Congestion Mitigation & Capacity Recovery Model\n(Impact of integer patrol deployment on bottleneck corridors)", pad=20, fontweight="bold", color=CHARCOAL)
    
    # Combine legends
    lines = line1 + [bars]
    labels = [l.get_label() for l in lines]
    ax1.legend(lines, labels, loc="upper right", frameon=True, facecolor="white", edgecolor="#E2E8F0")
    
    plt.tight_layout()
    plot_path = os.path.join(OUTPUT_DIR, "patrol_mitigation_impact.png")
    plt.savefig(plot_path, dpi=300)
    plt.close()
    print(f"Saved: {plot_path}")

if __name__ == "__main__":
    print("Generating PPT-ready figures...")
    plot_model_comparison()
    plot_hotspot_clusters()
    plot_diurnal_risk()
    plot_mitigation_impact()
    print("All figures successfully saved in output/plots directory!")
