import os
import subprocess
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler

app = FastAPI(title="Atlas GNN Backend Service")

# Allow CORS requests from any origin (so Vercel serverless functions can fetch telemetry files)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def run_gnn_pipeline():
    print("[Scheduler] Starting spatiotemporal GNN retraining and schedule updates...")
    try:
        # Run the pipeline shell script
        # Using sh for unix/linux environments (Render/Docker)
        result = subprocess.run(["sh", "./run_pipeline.sh"], capture_output=True, text=True)
        print("[Scheduler] Pipeline output:\n", result.stdout)
        if result.returncode != 0:
            print("[Scheduler] Error running GNN pipeline:\n", result.stderr)
    except Exception as e:
        print("[Scheduler] GNN pipeline execution failed: ", str(e))

# Setup background scheduler to retrain GNN model and update schedules every 12 hours
scheduler = BackgroundScheduler()
scheduler.add_job(run_gnn_pipeline, 'interval', hours=12)
scheduler.start()

@app.get("/healthz")
def health_check():
    return {"status": "healthy", "scheduler_active": scheduler.running}

# Mount output/ directory to serve generated JSON/CSV files statically
os.makedirs("output", exist_ok=True)
app.mount("/static", StaticFiles(directory="output"), name="static")

if __name__ == "__main__":
    import uvicorn
    # Execute the GNN pipeline on startup to ensure output files are fresh and present
    print("[Startup] Running initial GNN pipeline training...")
    run_gnn_pipeline()
    
    port = int(os.environ.get("PORT", 8000))
    print(f"[Startup] Launching FastAPI server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
