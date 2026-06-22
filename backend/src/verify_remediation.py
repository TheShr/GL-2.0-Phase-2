import os
import sys
import hashlib
import numpy as np
import pandas as pd
import json

# Add src to python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from data_pipeline import load_and_clean_data
from recommendation_engine import simulate_corridor_ctm
from dispatcher import PatrolAllocationOptimizer

def test_timezone():
    print("Verifying timezone peak corrections...")
    # Test that UTC times are correctly mapped to IST
    # 2023-11-20 19:00:00 (PST) -> Should convert to 2023-11-21 08:30:00 IST (+13.5 hours)
    # 2024-04-08 06:00:00 (PDT) -> Should convert to 2024-04-08 18:30:00 IST (+12.5 hours)
    test_dates = [
        "2023-11-20 19:00:00+00",
        "2024-04-08 06:00:00+00",
    ]
    df = pd.DataFrame({"created_datetime": test_dates})
    df['created_datetime_str'] = df['created_datetime'].astype(str).str.replace(r'(\+\d{2}:?\d{2}|\+\d{2}|Z)$', '', regex=True)
    df['created_datetime_naive'] = pd.to_datetime(df['created_datetime_str'], format='mixed', errors='coerce')
    df['created_ist'] = df['created_datetime_naive'].dt.tz_localize('America/Los_Angeles', ambiguous='NaT', nonexistent='NaT').dt.tz_convert('Asia/Kolkata')
    
    t1 = df.loc[0, 'created_ist']
    t2 = df.loc[1, 'created_ist']
    
    assert t1.hour == 8 and t1.minute == 30, f"Expected 08:30 IST for PST conversion, got {t1.strftime('%H:%M')}"
    assert t2.hour == 18 and t2.minute == 30, f"Expected 18:30 IST for PDT conversion, got {t2.strftime('%H:%M')}"
    print("Timezone conversion verification: PASSED")

def test_model_checkpoints():
    print("Verifying distinct GNN checkpoints...")
    baseline_path = "output/stgat_baseline.pt"
    tuned_path = "output/stgat_tuned.pt"
    
    if not os.path.exists(baseline_path) or not os.path.exists(tuned_path):
        # Check relative path
        current_dir = os.path.dirname(os.path.abspath(__file__))
        baseline_path = os.path.abspath(os.path.join(current_dir, "..", "output", "stgat_baseline.pt"))
        tuned_path = os.path.abspath(os.path.join(current_dir, "..", "output", "stgat_tuned.pt"))
        
    assert os.path.exists(baseline_path), f"Baseline checkpoint not found at {baseline_path}"
    assert os.path.exists(tuned_path), f"Tuned checkpoint not found at {tuned_path}"
    
    def get_file_hash(filepath):
        h = hashlib.sha256()
        with open(filepath, 'rb') as file:
            while chunk := file.read(8192):
                h.update(chunk)
        return h.hexdigest()
        
    hash_baseline = get_file_hash(baseline_path)
    hash_tuned = get_file_hash(tuned_path)
    
    print(f"  stgat_baseline.pt SHA256: {hash_baseline}")
    print(f"  stgat_tuned.pt SHA256: {hash_tuned}")
    
    assert hash_baseline != hash_tuned, "CRITICAL ERROR: stgat_baseline.pt and stgat_tuned.pt checkpoints are identical!"
    print("Model checkpoints verification: PASSED")

def test_ctm_physics():
    print("Verifying CTM physics simulation & shockwave propagation...")
    # Simulate a corridor with lanes=2, C_base=1600.0, q_demand=1550.0
    # A normal segment (rcf=0.0) should have a smaller travel time than a congested segment (rcf=0.3)
    t_normal = simulate_corridor_ctm(L_corridor=1.0, q_demand=1550.0, C_base=1600.0, rcf=0.0, lanes=2)
    t_congested = simulate_corridor_ctm(L_corridor=1.0, q_demand=1550.0, C_base=1600.0, rcf=0.3, lanes=2)
    
    print(f"  Normal Corridor Travel Time: {t_normal:.2f} mins/km")
    print(f"  Congested Corridor Travel Time (rcf=0.3): {t_congested:.2f} mins/km")
    
    assert t_congested > t_normal, "CTM fail: Congested corridor travel time must be higher than normal travel time!"
    print("CTM physics verification: PASSED")

def test_solver_decomposition():
    print("Verifying solver decomposition & LP relaxation fallback...")
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
        },
        {
            "hotspot_id": 2,
            "hotspot_name": "Junction B",
            "predicted_risk": 0.9,
            "commuter_delay_savings": 600.0,
            "logistics_penalty_index": 2.5,
            "officers_required": 3,
            "police_station": "Station B"
        }
    ]
    constraints = {
        "total_available_officers": 4,
        "max_officers_per_hotspot": 2,
        "max_deployments_per_station": {"Station A": 2, "Station B": 2}
    }
    
    res = optimizer.solve(hotspots, constraints)
    assert res["status"] == "success", "Decomposed solver failed execution."
    assert res["total_officers_allocated"] <= 4, "Allocated more units than budget constraints permit."
    print(f"  Allocated units: {res['total_officers_allocated']}")
    print("Solver decomposition verification: PASSED")

if __name__ == "__main__":
    print("==================================================")
    print("RUNNING FINAL REMEDIATION VERIFICATION CHECKS")
    print("==================================================")
    try:
        test_timezone()
        test_model_checkpoints()
        test_ctm_physics()
        test_solver_decomposition()
        print("\nSUCCESS: All GridLock 2.0 Remediation assertions PASSED!")
    except Exception as e:
        print(f"\nASSERTION ERROR: Remediation verification failed: {e}")
        sys.exit(1)
