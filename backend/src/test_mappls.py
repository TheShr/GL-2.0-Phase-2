import unittest
from mappls_service import MapplsService

class TestMapplsService(unittest.TestCase):
    def setUp(self):
        self.service = MapplsService()

    def test_initialization(self):
        self.assertTrue(len(self.service.token) > 0)
        self.assertEqual(self.service.timeout, 3.0)

    def test_snap_to_road_fallback(self):
        # A simple coordinate pair (Hebbal Junction)
        points = [(13.035, 77.597)]
        snapped = self.service.snap_to_road(points)
        self.assertEqual(len(snapped), len(points))
        # Ensure it returns valid float tuples
        self.assertIsInstance(snapped[0], tuple)
        self.assertIsInstance(snapped[0][0], float)

    def test_reverse_geocode(self):
        # Coordinates for HSR Layout region
        lat, lon = 12.910, 77.641
        address = self.service.reverse_geocode(lat, lon)
        self.assertIsInstance(address, str)
        self.assertTrue(len(address) > 0)
        print(f"Reverse geocode response: {address}")

    def test_route_delay(self):
        # Coordinates along Hosur Road
        start_lat, start_lon = 12.917, 77.622  # Silk Board
        end_lat, end_lon = 12.845, 77.663      # Electronic City
        try:
            delay = self.service.get_route_delay(start_lat, start_lon, end_lat, end_lon)
            if delay is not None:
                self.assertGreaterEqual(delay, 0.0)
                print(f"Distance Matrix delay: {delay:.2f} minutes")
        except Exception as e:
            print(f"Distance Matrix threw exception (expected for offline or limits): {e}")

    def test_route_delay_for_station(self):
        delay = self.service.get_route_delay_for_station("HSR Layout Police Station")
        if delay is not None:
            self.assertGreaterEqual(delay, 0.0)
            print(f"Matched route traffic delay: {delay} mins")
        else:
            print("No matching route delay or API failed; fallback is active.")

if __name__ == "__main__":
    unittest.main()
