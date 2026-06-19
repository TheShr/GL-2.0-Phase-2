import os
import requests
import logging

# Configure basic logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("MapplsService")

# Load environment variables from backend/.env if it exists
def load_env_file():
    src_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.dirname(src_dir)
    env_path = os.path.join(backend_dir, ".env")
    if os.path.exists(env_path):
        try:
            with open(env_path, "r") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#"):
                        parts = line.split("=", 1)
                        if len(parts) == 2:
                            key = parts[0].strip()
                            val = parts[1].strip()
                            os.environ[key] = val
        except Exception as e:
            logger.warning(f"Failed to read .env file at {env_path}: {e}")

load_env_file()

class MapplsService:
    def __init__(self):
        self.token = os.environ.get("MAPPLS_TOKEN", "rysmqsqzhyrdjzzdhxthpgdljebmkdipyjmb")
        self.timeout = 3.0  # Strict timeout limit of 3.0 seconds

        # Predefined Flipkart Logistics Routes
        self.FLIPKART_ROUTES = {
            'Whitefield': {
                'start': (12.989, 77.696),  # Mahadevapura
                'end': (12.969, 77.750)     # ITPL
            },
            'Electronic City': {
                'start': (12.917, 77.622),  # Silk Board
                'end': (12.845, 77.663)     # Electronic City
            },
            'Koramangala': {
                'start': (12.934, 77.624),  # Koramangala
                'end': (12.920, 77.670)     # Ibblur
            },
            'Hebbal': {
                'start': (13.035, 77.597),  # Hebbal
                'end': (13.018, 77.643)     # Kalyan Nagar
            }
        }

    def snap_to_road(self, points):
        """
        Accepts a list of (lat, lon) coordinates, batches them to max 100 points,
        queries the Mappls Snap to Road API, and returns snapped (lat, lon) coordinates.
        Falls back to the original coordinates if the API call fails or rate limits.
        """
        if not points:
            return []

        snapped_all = []
        batch_size = 100

        for i in range(0, len(points), batch_size):
            batch = points[i:i + batch_size]
            # Mappls format is longitude,latitude separated by semicolons
            pts_str = ";".join([f"{lon:.6f},{lat:.6f}" for lat, lon in batch])
            
            url = "https://route.mappls.com/route/movement/snapToRoad"
            params = {
                "access_token": self.token,
                "pts": pts_str
            }

            try:
                logger.info(f"Querying Mappls Snap to Road for batch of size {len(batch)}...")
                response = requests.get(url, params=params, timeout=self.timeout)
                
                # Check status code
                if response.status_code == 429:
                    raise Exception("HTTP 429: Rate Limit Exceeded")
                elif response.status_code == 503:
                    raise Exception("HTTP 503: Service Unavailable")
                
                response.raise_for_status()
                data = response.json()

                # Robust parsing of response JSON
                batch_snapped = list(batch)  # Default/fallback is original points in this batch
                
                snapped_points = data.get("snappedPoints", [])
                for pt in snapped_points:
                    orig_idx = pt.get("originalIndex")
                    loc = pt.get("location", {})
                    if orig_idx is not None and 0 <= orig_idx < len(batch):
                        lat = loc.get("latitude")
                        lon = loc.get("longitude")
                        if lat is not None and lon is not None:
                            batch_snapped[orig_idx] = (float(lat), float(lon))
                
                logger.info(f"Successfully snapped {len(snapped_points)} points to road network.")
                snapped_all.extend(batch_snapped)

            except Exception as e:
                logger.warning(f"Snap to Road failed for batch {i//batch_size + 1}: {e}. Falling back to original coordinates.")
                snapped_all.extend(batch)

        return snapped_all

    def reverse_geocode(self, lat, lon):
        """
        Accepts latitude and longitude, queries Mappls Reverse Geocoding API,
        and returns a human-readable landmark/address string.
        Falls back to a coordinates description if the API call fails or rate limits.
        """
        url = "https://search.mappls.com/search/address/rev-geocode"
        params = {
            "access_token": self.token,
            "lat": lat,
            "lng": lon,  # support both lng and lon
            "lon": lon
        }

        try:
            logger.info(f"Querying Mappls Reverse Geocode for ({lat:.4f}, {lon:.4f})...")
            response = requests.get(url, params=params, timeout=self.timeout)
            
            if response.status_code == 429:
                raise Exception("HTTP 429: Rate Limit Exceeded")
            elif response.status_code == 503:
                raise Exception("HTTP 503: Service Unavailable")

            response.raise_for_status()
            data = response.json()

            # Parse results array or top-level formatted address
            address_str = ""
            results = data.get("results", [])
            if isinstance(results, list) and len(results) > 0:
                address_str = results[0].get("formatted_address", "")
            elif isinstance(results, dict):
                address_str = results.get("formatted_address", "")
            else:
                address_str = data.get("formatted_address", "")

            if not address_str:
                # Try finding display_name or fallback
                address_str = data.get("display_name", "")

            if address_str:
                logger.info(f"Reverse geocode successful: {address_str[:60]}...")
                return address_str
            else:
                raise Exception("No address string found in response")

        except Exception as e:
            logger.warning(f"Reverse Geocoding failed for ({lat:.4f}, {lon:.4f}): {e}. Falling back to coordinates label.")
            return f"Near coordinates ({lat:.4f}, {lon:.4f})"

    def get_route_delay(self, start_lat, start_lon, end_lat, end_lon):
        """
        Calculates travel delay (live traffic duration - free-flow duration) in minutes.
        Queries the Mappls Distance Matrix API.
        Appends traffic=true/traffic=false parameters.
        Returns travel delay in minutes, or None if the API fails.
        """
        source = f"{start_lon:.6f},{start_lat:.6f}"
        destination = f"{end_lon:.6f},{end_lat:.6f}"

        # API endpoint paths
        traffic_url = f"https://route.mappls.com/route/dm/distance_matrix_traffic/driving/{source};{destination}"
        freeflow_url = f"https://route.mappls.com/route/dm/distance_matrix/driving/{source};{destination}"

        params_traffic = {
            "access_token": self.token,
            "traffic": "true"
        }
        params_freeflow = {
            "access_token": self.token,
            "traffic": "false"
        }

        try:
            logger.info(f"Querying Mappls Distance Matrix (Traffic) from ({start_lat:.4f}, {start_lon:.4f}) to ({end_lat:.4f}, {end_lon:.4f})...")
            
            # 1. Fetch live traffic duration
            resp_t = requests.get(traffic_url, params=params_traffic, timeout=self.timeout)
            if resp_t.status_code == 429:
                raise Exception("HTTP 429: Rate Limit Exceeded")
            elif resp_t.status_code == 503:
                raise Exception("HTTP 503: Service Unavailable")
            resp_t.raise_for_status()
            data_t = resp_t.json()

            # 2. Fetch free-flow baseline duration
            resp_f = requests.get(freeflow_url, params=params_freeflow, timeout=self.timeout)
            resp_f.raise_for_status()
            data_f = resp_f.json()

            # Helper to parse duration from results
            def parse_duration(data):
                results = data.get("results", [])
                if isinstance(results, list) and len(results) > 0:
                    durations = results[0].get("durations", [])
                elif isinstance(results, dict):
                    durations = results.get("durations", [])
                else:
                    durations = data.get("durations", [])

                if isinstance(durations, list) and len(durations) > 0:
                    # The second element is source to destination (first is source to source = 0)
                    if len(durations) > 1:
                        return float(durations[1])
                    return float(durations[0])
                return None

            dur_traffic = parse_duration(data_t)
            dur_freeflow = parse_duration(data_f)

            if dur_traffic is not None and dur_freeflow is not None:
                # Travel delay is (duration with traffic) - (free flow duration) in minutes
                delay_sec = dur_traffic - dur_freeflow
                delay_min = max(0.0, delay_sec / 60.0)
                logger.info(f"Distance Matrix successful. Traffic: {dur_traffic/60:.1f}m, FreeFlow: {dur_freeflow/60:.1f}m. Delay: {delay_min:.2f}m")
                return delay_min
            else:
                raise Exception("Could not parse durations from API responses")

        except Exception as e:
            logger.warning(f"Distance Matrix failed: {e}. Raising for caller to fall back.")
            raise

    def get_route_delay_for_station(self, station):
        """
        Maps a police station to its nearest designated Flipkart Logistics Route and
        queries the traffic delay. Returns delay in minutes, or None if not matching/fails.
        """
        matched_route = None
        station_lower = station.lower()

        if 'old airport' in station_lower or 'airport' in station_lower or 'bellandur' in station_lower:
            matched_route = 'Whitefield'  # HAL/Bellandur connects to Whitefield IT PL / ORR corridors
        elif 'hsr' in station_lower or 'electronic' in station_lower:
            matched_route = 'Electronic City'
        elif 'koramangala' in station_lower or 'sarjapur' in station_lower:
            matched_route = 'Koramangala'
        elif 'hebbal' in station_lower:
            matched_route = 'Hebbal'

        if matched_route and matched_route in self.FLIPKART_ROUTES:
            route = self.FLIPKART_ROUTES[matched_route]
            logger.info(f"Station {station} matched to Flipkart Route: {matched_route}")
            try:
                start_lat, start_lon = route['start']
                end_lat, end_lon = route['end']
                return self.get_route_delay(start_lat, start_lon, end_lat, end_lon)
            except Exception:
                # Let caller handle the failure and fall back
                return None
        return None

    def get_distance_matrix_matrix(self, locations):
        """
        Calculates an NxN matrix of travel durations (seconds) between locations.
        locations: list of dicts with name, lat, lon.
        """
        import numpy as np
        pts = ";".join([f"{loc['lon']:.6f},{loc['lat']:.6f}" for loc in locations])
        url = f"https://route.mappls.com/route/dm/distance_matrix_traffic/driving/{pts}"
        params = {
            "access_token": self.token,
            "traffic": "true"
        }
        try:
            logger.info(f"Querying Mappls Distance Matrix Matrix for {len(locations)} hubs...")
            response = requests.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()
            # Mappls returns matrix format
            results = data.get("results", {})
            if isinstance(results, dict) and "durations" in results:
                return results["durations"]
            elif "durations" in data:
                return data["durations"]
            raise Exception("Durations not found in matrix response")
        except Exception as e:
            logger.warning(f"Distance Matrix Matrix API failed: {e}. Returning mock matrices.")
            # Return fallback mock matrix
            n = len(locations)
            mock_durations = [[0.0] * n for _ in range(n)]
            for i in range(n):
                for j in range(n):
                    if i != j:
                        # Estimate travel time based on distance (crude approximation)
                        dy = locations[i]['lat'] - locations[j]['lat']
                        dx = locations[i]['lon'] - locations[j]['lon']
                        dist_km = np.sqrt(dx*dx + dy*dy) * 111.0
                        mock_durations[i][j] = float((dist_km / 25.0) * 3600.0)
            return mock_durations

    def get_route_eta(self, start_lat, start_lon, end_lat, end_lon, traffic=True):
        """
        Queries Mappls Routing API (Route ETA API Traffic or Route ADV API Non-Traffic).
        Returns route details including duration (seconds), distance (meters), and geometry (polyline).
        """
        coords_str = f"{start_lon:.6f},{start_lat:.6f};{end_lon:.6f},{end_lat:.6f}"
        url = f"https://route.mappls.com/route/v1/driving/{coords_str}"
        params = {
            "access_token": self.token,
            "overview": "full",
            "geometries": "polyline",
            "steps": "true",
            "alternatives": "false",
            "traffic": "true" if traffic else "false"
        }
        try:
            logger.info(f"Querying Mappls Routing API (traffic={traffic})...")
            response = requests.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()
            routes = data.get("routes", [])
            if routes:
                return {
                    "duration": float(routes[0].get("duration", 0)),
                    "distance": float(routes[0].get("distance", 0)),
                    "geometry": routes[0].get("geometry", "")
                }
            raise Exception("No routes found in response")
        except Exception as e:
            logger.warning(f"Routing API (traffic={traffic}) failed: {e}. Using mock estimation.")
            import math
            dy = end_lat - start_lat
            dx = end_lon - start_lon
            dist_km = math.sqrt(dx*dx + dy*dy) * 111.0
            speed = 25.0 if traffic else 40.0
            dur_sec = (dist_km / speed) * 3600.0
            return {
                "duration": dur_sec,
                "distance": dist_km * 1000.0,
                "geometry": ""
            }

    def get_pois_along_route(self, path_polyline, category="dining", buffer=50):
        """
        Queries Mappls POI Along the Route API.
        """
        url = "https://atlas.mappls.com/api/places/alongroute"
        params = {
            "access_token": self.token,
            "category": category,
            "buffer": buffer,
            "path": path_polyline
        }
        try:
            logger.info(f"Querying Mappls POI Along Route for category {category}...")
            response = requests.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()
            return data.get("suggestedPOIs", [])
        except Exception as e:
            logger.warning(f"POI Along Route failed for category {category}: {e}. Returning empty list.")
            return []

    def autosuggest(self, query, bias_lat=12.9716, bias_lon=77.5946):
        """
        Queries Mappls Autosuggest API.
        """
        url = "https://atlas.mappls.com/api/places/geocode/autocomplete"
        params = {
            "access_token": self.token,
            "query": query,
            "location": f"{bias_lat},{bias_lon}"
        }
        try:
            logger.info(f"Querying Mappls Autosuggest for '{query}'...")
            response = requests.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()
            return data.get("suggestedLocations", [])
        except Exception as e:
            logger.warning(f"Autosuggest failed for '{query}': {e}. Returning empty list.")
            return []

    def place_detail(self, eloc):
        """
        Queries Mappls Place Detail API for an eLoc ID.
        """
        url = f"https://atlas.mappls.com/api/places/detail/{eloc}"
        params = {
            "access_token": self.token
        }
        try:
            logger.info(f"Querying Mappls Place Detail for eLoc '{eloc}'...")
            response = requests.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.warning(f"Place Detail failed for eLoc '{eloc}': {e}. Returning empty dict.")
            return {}

    def get_elevation(self, lat, lon):
        """
        Queries Mappls Elevation API or falls back to a deterministic terrain height model for Bengaluru.
        Uses a local file cache to prevent rate-limiting and accelerate execution.
        """
        import os
        key = f"{lat:.5f},{lon:.5f}"
        if not hasattr(self, '_elevation_cache'):
            self._elevation_cache = {}
            import json
            try:
                if os.path.exists("output/elevation_cache.json"):
                    with open("output/elevation_cache.json", "r") as f:
                        self._elevation_cache = json.load(f)
            except Exception:
                pass

        if key in self._elevation_cache:
            return float(self._elevation_cache[key])

        import numpy as np
        url = "https://apis.mappls.com/elevation"
        params = {
            "access_token": self.token,
            "pts": f"{lon:.6f},{lat:.6f}"
        }
        try:
            logger.info(f"Querying Mappls Elevation for ({lat:.4f}, {lon:.4f})...")
            response = requests.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            data = response.json()
            results = data.get("results", [])
            if results:
                val = float(results[0].get("elevation", 900.0))
                self._elevation_cache[key] = val
                try:
                    import json
                    os.makedirs("output", exist_ok=True)
                    with open("output/elevation_cache.json", "w") as f:
                        json.dump(self._elevation_cache, f)
                except Exception:
                    pass
                return val
        except Exception:
            pass

        # Deterministic terrain model for Bengaluru:
        val = 900.0 + 35.0 * np.sin(lat * 80.0) + 25.0 * np.cos(lon * 65.0)
        self._elevation_cache[key] = float(val)
        return float(val)


