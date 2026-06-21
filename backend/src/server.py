import os
import subprocess
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from apscheduler.schedulers.background import BackgroundScheduler
from predict_service import predict_scenario

app = FastAPI(title="Atlas GNN Backend Service")

# Allow CORS requests from any origin (so Vercel serverless functions can fetch telemetry files)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PredictRequest(BaseModel):
    node_id: str
    hour: int
    day_of_week: int
    scooter_count: float = 0
    car_count: float = 0
    auto_count: float = 0
    total_count: float | None = None
    lanes_override: float | None = None

@app.post("/predict")
def predict(req: PredictRequest):
    # Validate input ranges
    if not (0 <= req.hour <= 23):
        raise HTTPException(status_code=400, detail=f"Invalid hour '{req.hour}'. Must be between 0 and 23.")
    if not (0 <= req.day_of_week <= 6):
        raise HTTPException(status_code=400, detail=f"Invalid day_of_week '{req.day_of_week}'. Must be between 0 (Monday) and 6 (Sunday).")
        
    try:
        results = predict_scenario(
            node_id=req.node_id,
            hour=req.hour,
            day_of_week=req.day_of_week,
            scooter_count=req.scooter_count,
            car_count=req.car_count,
            auto_count=req.auto_count,
            total_count=req.total_count,
            lanes_override=req.lanes_override
        )
        return results
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

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

# Setup background scheduler to retrain GNN model and update schedules every 12 hours (unless disabled)
disable_retraining = os.environ.get("DISABLE_RETRAINING", "false").lower() in ("true", "1", "yes")

scheduler = None
if not disable_retraining:
    scheduler = BackgroundScheduler()
    scheduler.add_job(run_gnn_pipeline, 'interval', hours=12)
    scheduler.start()
    print("[Startup] Background GNN retraining scheduler started.")
else:
    print("[Startup] Background GNN retraining scheduler is disabled.")

@app.get("/healthz")
def health_check():
    return {"status": "healthy", "scheduler_active": scheduler.running if scheduler else False}

# Mount output/ directory to serve generated JSON/CSV files statically
os.makedirs("output", exist_ok=True)
app.mount("/static", StaticFiles(directory="output"), name="static")

if __name__ == "__main__":
    import uvicorn
    # We do NOT run GNN retraining synchronously on startup to prevent Uvicorn port binding timeouts 
    # and OOM crashes on hosting environments with low memory caps (like Render's 512MB limit).
    # Pre-computed model predictions are served statically from the backend/output/ folder.
    
    port = int(os.environ.get("PORT", 8000))
    print(f"[Startup] Launching FastAPI server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
