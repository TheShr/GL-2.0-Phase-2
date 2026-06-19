import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Helper to split CSV line, handling quoted columns
const splitCsvLine = (line: string) => {
  return line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(item => {
    let clean = item.trim();
    if (clean.startsWith('"') && clean.endsWith('"')) {
      clean = clean.substring(1, clean.length - 1);
    }
    return clean;
  });
};

function getRoadProfile(policeStation: string) {
  // Arterial Roads (Tech corridors / ring roads)
  if (['HAL Old Airport', 'Hebbala', 'High ground', 'Chikkajala', 'HSR Layout', 'Bellandur'].includes(policeStation)) {
    return {
      road_class: 'Arterial Highway Corridor',
      C_base: 4000.0,
      q_demand: 3900.0,
      road_importance: 1.5,
      lanes: 3
    };
  }
  // Secondary/Commercial Streets (Narrow business markets / downtown blocks)
  else if (['Upparpet', 'Shivajinagar', 'City Market', 'Malleshwaram', 'Vijayanagara', 'Rajajinagar', 'Kodigehalli', 'Magadi Road'].includes(policeStation)) {
    return {
      road_class: 'Secondary Commercial Street',
      C_base: 1600.0,
      q_demand: 1550.0,
      road_importance: 1.2,
      lanes: 2
    };
  }
  // Collector/Residential Streets (Suburb roads with lower flows)
  else {
    return {
      road_class: 'Collector/Residential Corridor',
      C_base: 1000.0,
      q_demand: 950.0,
      road_importance: 0.8,
      lanes: 1
    };
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Check if this is a What-If Simulation Engine request
    if (body.current_risk !== undefined && body.officers_deployed !== undefined) {
      const {
        hotspot_id,
        current_risk,
        officers_deployed,
        road_capacity,
        average_speed,
        logistics_importance
      } = body;
      
      const V_free = 40.0; // km/h free-flow speed
      const C_base = road_capacity || 2000.0;
      const q_demand = 0.90 * C_base; // High demand scenario
      
      // Calculate jam density from Greenshields model relation: C = (rho_jam * V_free) / 4
      const rho_jam = (4.0 * C_base) / V_free;
      
      // Diminishing returns efficacy model for officer deployment:
      // Each officer reduces risk by 25% (exponential decay)
      const risk_reduction_coeff = Math.exp(-0.25 * officers_deployed);
      const updated_risk = Math.max(0.0, Math.min(1.0, current_risk * risk_reduction_coeff));
      
      // Road capacity loss fraction (Road Choke Factor - max capacity reduction is 45%)
      const rcf_before = Math.min(0.45, current_risk * 0.45);
      const rcf_after = Math.min(0.45, updated_risk * 0.45);
      
      // Helper function to solve Greenshields model with queuing wave delay
      const solveWhatIfGreenshields = (rcf: number) => {
        const local_rho_jam = rho_jam * (1.0 - rcf);
        const local_C = C_base * (1.0 - rcf);
        
        let t_total = 0.0;
        let delay_q = 0.0;
        
        if (q_demand > local_C) {
          // Congested Bottleneck (queuing model)
          const rho_c = local_rho_jam / 2.0;
          const v_c = V_free * (1.0 - (rho_c / local_rho_jam));
          const t_segment = (1.0 / v_c) * 60.0; // min per km
          delay_q = ((q_demand - local_C) / (2.0 * local_C)) * 60.0; // queuing wave delay
          t_total = t_segment + delay_q;
        } else {
          // Under-capacity Flow
          const c_coeff = (q_demand * local_rho_jam) / V_free;
          const discriminant = (local_rho_jam ** 2) - (4.0 * c_coeff);
          let rho_val = 0.0;
          
          if (discriminant >= 0) {
            rho_val = (local_rho_jam - Math.sqrt(discriminant)) / 2.0;
          } else {
            rho_val = local_rho_jam / 2.0;
          }
          
          const v_val = V_free * (1.0 - (rho_val / local_rho_jam));
          t_total = (1.0 / v_val) * 60.0;
        }
        return { travel_time: t_total, queuing_delay: delay_q };
      };
      
      const results_before = solveWhatIfGreenshields(rcf_before);
      const results_after = solveWhatIfGreenshields(rcf_after);
      
      const t_before = results_before.travel_time;
      const t_after = results_after.travel_time;
      
      // Calculate metric savings
      const congestion_reduction_percent = t_before > 0 ? ((t_before - t_after) / t_before) * 100.0 : 0.0;
      const capacity_recovery_percent = (rcf_before - rcf_after) * 100.0;
      
      const delay_savings_per_vehicle = Math.max(0.0, t_before - t_after);
      const commuter_delay_saved = (delay_savings_per_vehicle / 60.0) * q_demand; // vehicle-hours saved
      const logistics_delay_saved = commuter_delay_saved * (logistics_importance || 1.0);
      
      return NextResponse.json({
        hotspot_id,
        current_risk,
        updated_risk: parseFloat(updated_risk.toFixed(3)),
        congestion_reduction_percent: parseFloat(congestion_reduction_percent.toFixed(1)),
        capacity_recovery_percent: parseFloat(capacity_recovery_percent.toFixed(1)),
        commuter_delay_saved: parseFloat(commuter_delay_saved.toFixed(2)),
        logistics_delay_saved: parseFloat(logistics_delay_saved.toFixed(2)),
        physics_metrics: {
          q_demand: Math.round(q_demand),
          jam_density: Math.round(rho_jam),
          rcf_before: parseFloat(rcf_before.toFixed(3)),
          rcf_after: parseFloat(rcf_after.toFixed(3)),
          travel_time_before_min_km: parseFloat(t_before.toFixed(2)),
          travel_time_after_min_km: parseFloat(t_after.toFixed(2))
        }
      });
    }

    // Fallback to previous simulation behavior
    const { cluster_id, patrols_deployed, tow_trucks } = body;
    
    if (cluster_id === undefined || patrols_deployed === undefined || tow_trucks === undefined) {
      return NextResponse.json({ error: "Missing required parameters." }, { status: 400 });
    }

    const rootDir = process.cwd();
    const schedulePath = path.join(rootDir, "..", "backend", "output", "enforcement_schedule.csv");

    if (!fs.existsSync(schedulePath)) {
      return NextResponse.json({ error: "Enforcement schedule file not found." }, { status: 404 });
    }

    const scheduleData = fs.readFileSync(schedulePath, "utf-8");
    const scheduleLines = scheduleData.split(/\r?\n/).filter(line => line.trim() !== "");
    const scheduleHeaders = splitCsvLine(scheduleLines[0]);

    let targetRow: any = null;

    for (let i = 1; i < scheduleLines.length; i++) {
      const values = splitCsvLine(scheduleLines[i]);
      if (values.length < scheduleHeaders.length) continue;

      const row: any = {};
      scheduleHeaders.forEach((header, index) => {
        row[header] = values[index];
      });

      if (parseInt(row.cluster_id, 10) === parseInt(cluster_id, 10)) {
        targetRow = row;
        break;
      }
    }

    if (!targetRow) {
      return NextResponse.json({ error: `Cluster ID ${cluster_id} not found in schedule.` }, { status: 404 });
    }

    const policeStation = targetRow.police_station;
    const profile = getRoadProfile(policeStation);

    const C_base = profile.C_base;
    const q_demand = profile.q_demand;
    const lanes = parseInt(targetRow.lanes || profile.lanes.toString(), 10);
    const road_importance = profile.road_importance;
    
    const V_free = 40.0;         // km/h
    const rho_jam_lane = 150.0;   // vehicles/km
    const rho_jam = rho_jam_lane * lanes;

    // Original capacity reduction and predicted risk
    const original_rcf = parseFloat(targetRow.capacity_reduction_rcf || "0");
    const predicted_risk = parseFloat(targetRow.predicted_risk_index || "0");

    // Dynamic RCF reduction based on deployed units
    // Each patrol unit resolves 25% of the capacity reduction, each tow truck resolves 50%
    const reduction_coefficient = 1.0 - (0.25 * patrols_deployed + 0.50 * tow_trucks);
    const rcf_new = Math.max(0.0, Math.min(0.45, original_rcf * reduction_coefficient));

    // Dynamic calculations for status quo (Before) vs dynamic mitigation (After)
    
    // Helper function to solve Greenshields model
    const solveGreenshields = (capacity: number, rcf: number) => {
      const local_rho_jam = rho_jam * (1.0 - rcf);
      const local_C = C_base * (1.0 - rcf);
      
      let t_total = 0.0;
      let delay_q = 0.0;
      
      if (q_demand > local_C) {
        // Bottleneck scenario
        const rho_c = local_rho_jam / 2.0;
        const v_c = V_free * (1.0 - (rho_c / local_rho_jam));
        const t_segment = (1.0 / v_c) * 60.0; // min per km
        delay_q = ((q_demand - local_C) / (2.0 * local_C)) * 60.0; // queuing delay wave
        t_total = t_segment + delay_q;
      } else {
        // Safe flow scenario
        const c_coeff = (q_demand * local_rho_jam) / V_free;
        const discriminant = (local_rho_jam ** 2) - (4.0 * c_coeff);
        let rho_val = 0.0;
        
        if (discriminant >= 0) {
          rho_val = (local_rho_jam - Math.sqrt(discriminant)) / 2.0;
        } else {
          rho_val = local_rho_jam / 2.0;
        }
        
        const v_val = V_free * (1.0 - (rho_val / local_rho_jam));
        t_total = (1.0 / v_val) * 60.0;
      }
      return { travel_time: t_total, queuing_delay: delay_q };
    };

    // Calculate normal (no violations) travel time
    const t_normal = solveGreenshields(C_base, 0.0).travel_time;

    // Calculate before state (original RCF)
    const before_results = solveGreenshields(C_base, original_rcf);
    const t_before = before_results.travel_time;

    // Calculate after state (mitigated RCF)
    const after_results = solveGreenshields(C_base, rcf_new);
    const t_after = after_results.travel_time;

    // Calculate commuter delay savings
    const delay_savings_per_vehicle = Math.max(0.0, t_before - t_after);
    const total_commuter_time_saved_hours = (delay_savings_per_vehicle / 60.0) * q_demand;

    // Calculate logistics weight
    let lambda_i = 1.0;
    if (['HAL Old Airport', 'Bellandur', 'HSR Layout', 'Hebbala', 'Upparpet'].includes(policeStation)) {
      lambda_i = 3.0;
    } else if (['Shivajinagar', 'City Market', 'Malleshwaram', 'Vijayanagara'].includes(policeStation)) {
      lambda_i = 1.8;
    }
    
    // Dynamic Logistics Penalty Index
    const lpi_new = rcf_new * lambda_i;

    return NextResponse.json({
      cluster_id,
      police_station: policeStation,
      lanes,
      capacity_reduction_before: Math.round(original_rcf * 100),
      capacity_reduction_after: Math.round(rcf_new * 100),
      travel_time_before: `${t_before.toFixed(1)} min/km`,
      travel_time_after: `${t_after.toFixed(1)} min/km`,
      delay_savings_per_vehicle: `${delay_savings_per_vehicle.toFixed(1)} min`,
      total_commuter_time_saved_hours: Math.round(total_commuter_time_saved_hours),
      logistics_penalty_index: lpi_new,
      resolved_percent: Math.round((original_rcf - rcf_new) / (original_rcf || 1.0) * 100)
    });
    
  } catch (error: any) {
    console.error("Simulation API Error: ", error);
    return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
  }
}
