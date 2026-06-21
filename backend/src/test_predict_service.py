import os
import sys
import unittest

# Add current directory to python path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

from predict_service import predict_scenario, get_nodes_df

class TestPredictService(unittest.TestCase):
    def setUp(self):
        # Trigger cache loading
        self.df = get_nodes_df()
        self.assertTrue(len(self.df) > 0, "Nodes database is empty.")
        self.test_node_id = str(self.df.index[0])
        print(f"Using node_id: {self.test_node_id} for tests.")

    def test_predict_valid_node(self):
        res = predict_scenario(
            node_id=self.test_node_id,
            hour=8,
            day_of_week=0,
            scooter_count=5,
            car_count=4,
            auto_count=3
        )
        self.assertEqual(res["node_id"], self.test_node_id)
        self.assertIn("baseline", res)
        self.assertIn("scenario", res)
        self.assertIn("delta_risk_hybrid", res)
        self.assertIn("feature_vector", res)
        
        # Verify risk values are bound to [0, 1]
        for key in ["risk_gnn", "risk_xgboost", "risk_hybrid"]:
            self.assertTrue(0.0 <= res["baseline"][key] <= 1.0, f"Baseline {key} out of bounds: {res['baseline'][key]}")
            self.assertTrue(0.0 <= res["scenario"][key] <= 1.0, f"Scenario {key} out of bounds: {res['scenario'][key]}")

    def test_predict_invalid_node_errors(self):
        with self.assertRaises(KeyError):
            predict_scenario(
                node_id="nonexistent_node_id_99999",
                hour=12,
                day_of_week=1,
                scooter_count=0,
                car_count=0,
                auto_count=0
            )

    def test_increasing_counts_changes_risk(self):
        # Get prediction with low traffic
        res_low = predict_scenario(
            node_id=self.test_node_id,
            hour=18,
            day_of_week=4,
            scooter_count=1,
            car_count=1,
            auto_count=1
        )
        
        # Get prediction with high traffic
        res_high = predict_scenario(
            node_id=self.test_node_id,
            hour=18,
            day_of_week=4,
            scooter_count=30,
            car_count=30,
            auto_count=30
        )
        
        xgb_low = res_low["scenario"]["risk_xgboost"]
        xgb_high = res_high["scenario"]["risk_xgboost"]
        
        print(f"XGBoost risk with low counts: {xgb_low:.4f} vs high counts: {xgb_high:.4f}")
        # Note: Depending on feature weights, a substantial increase in vehicles should lead to higher or changed risk.
        # We assert that they are not identical, or that high traffic is >= low traffic risk.
        self.assertNotEqual(xgb_low, xgb_high, "Risk values did not change with traffic level overrides.")

if __name__ == "__main__":
    unittest.main()
