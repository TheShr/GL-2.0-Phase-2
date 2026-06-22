import os
import pandas as pd
import numpy as np
import ast
import json

def load_and_clean_data(csv_path):
    print(f"Loading data from {csv_path}...")
    df = pd.read_csv(csv_path)
    initial_rows = len(df)
    print(f"Loaded {initial_rows} rows.")

    # 1. Filter out rejected violations
    # Approved are kept, NaNs (pending/untracked) and created1/processing/duplicate are kept as they are potential occurrences.
    # Rejections are definitively removed.
    df = df[df['validation_status'] != 'rejected']
    filtered_rows = len(df)
    print(f"Filtered out rejected rows. Remaining: {filtered_rows} ({initial_rows - filtered_rows} rows removed).")

    # 2. Parse created_datetime and convert to Indian Standard Time (IST)
    print("Converting timestamps to IST (remedying US Pacific timezone shift)...")
    # Convert to string and strip '+00' (or other offsets) to obtain the clock time in PST/PDT
    df['created_datetime_str'] = df['created_datetime'].astype(str).str.replace(r'(\+\d{2}:?\d{2}|\+\d{2}|Z)$', '', regex=True)
    df['created_datetime_naive'] = pd.to_datetime(df['created_datetime_str'], format='mixed', errors='coerce')
    # Drop rows with unparseable timestamps
    df = df.dropna(subset=['created_datetime_naive'])
    
    # Localize to America/Los_Angeles (which correctly accounts for PST/PDT and DST boundaries)
    # and then convert to Asia/Kolkata (IST)
    df['created_ist'] = df['created_datetime_naive'].dt.tz_localize('America/Los_Angeles', ambiguous='NaT', nonexistent='NaT').dt.tz_convert('Asia/Kolkata')
    # Drop any rows that became NaT due to DST transitions
    df = df.dropna(subset=['created_ist'])
    
    # Extract temporal features
    df['hour'] = df['created_ist'].dt.hour
    df['dayofweek'] = df['created_ist'].dt.dayofweek
    df['month'] = df['created_ist'].dt.month
    df['date'] = df['created_ist'].dt.date

    # 3. Cyclical time encoding (Sine & Cosine)
    # Hour of day cyclical encoding (24 hours)
    df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24.0)
    df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24.0)
    
    # Day of week cyclical encoding (7 days)
    df['dow_sin'] = np.sin(2 * np.pi * df['dayofweek'] / 7.0)
    df['dow_cos'] = np.cos(2 * np.pi * df['dayofweek'] / 7.0)

    # 4. Parse JSON arrays in violation_type
    print("Parsing violation types...")
    def extract_violations(v_str):
        try:
            val = ast.literal_eval(v_str)
            if isinstance(val, list):
                return [v.strip().upper() for v in val]
            return [str(val).strip().upper()]
        except Exception:
            return [str(v_str).strip().upper()]

    df['violation_list'] = df['violation_type'].fillna("[]").apply(extract_violations)

    # 5. Save a summary diagnostic report
    print("Generating pipeline audit report...")
    report = []
    report.append("=== PIPELINE CLEANED DATA AUDIT ===")
    report.append(f"Total Cleaned Records: {len(df)}")
    report.append(f"Timezone: Asia/Kolkata")
    report.append(f"IST Temporal Scope - Start: {df['created_ist'].min()}, End: {df['created_ist'].max()}")
    
    # Check hour distribution in IST
    report.append("\n=== IST HOUR DISTRIBUTION ===")
    hr_counts = df['hour'].value_counts().sort_index()
    for hr, cnt in hr_counts.items():
        report.append(f"Hour {hr:02d}: {cnt} ({cnt/len(df)*100:.2f}%)")
        
    # Check vehicle distribution
    report.append("\n=== VEHICLE TYPE DISTRIBUTION (CLEANED) ===")
    v_counts = df['vehicle_type'].value_counts(dropna=False)
    for vt, cnt in v_counts.items():
        report.append(f"{vt}: {cnt} ({cnt/len(df)*100:.2f}%)")

    # Save summary report to workspace file
    os.makedirs("output", exist_ok=True)
    report_text = "\n".join(report)
    with open("output/pipeline_report.txt", "w", encoding="utf-8") as f:
        f.write(report_text)
        
    print("Pipeline completed successfully! Diagnostic report written to: output/pipeline_report.txt")
    return df

if __name__ == "__main__":
    current_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.abspath(os.path.join(current_dir, "..", "dataset", "jan to may police violation_anonymized791b166.csv.gz"))
    if not os.path.exists(csv_path):
        csv_path = os.path.abspath(os.path.join(current_dir, "..", "dataset", "jan to may police violation_anonymized791b166.csv"))
    if not os.path.exists(csv_path):
        csv_path = r"c:\Users\anujs\OneDrive\Desktop\GridLock Phase 2\dataset\jan to may police violation_anonymized791b166.csv"
    load_and_clean_data(csv_path)
