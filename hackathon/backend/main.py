from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import osmnx as ox
import networkx as nx

app = FastAPI(title="PDPM IIITDMJ Quantum Campus Routing API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Campus Building Coordinates mapping directly to front-end nodeIds
BUILDING_COORDS = {
    'admin_block': (23.179402, 80.027300),
    'lecture_hall': (23.176859, 80.024425),
    'library': (23.176021, 80.026764),
    'sac': (23.176129, 80.022976),
    'vashistha': (23.178002, 80.022504),
    'aryabhatta': (23.176485, 80.020498),
    'panini': (23.174996, 80.020809),
    'visitors_hostel': (23.174375, 80.027997),
    'central_mess': (23.177195, 80.021206),
    'canteen': (23.178161, 80.024714),
    'health_centre': (23.175990, 80.027912)
}

G = None

class RouteRequest(BaseModel):
    start_node: str
    end_node: str

@app.on_event("startup")
def load_osm_network():
    global G
    # Locate files relative to this script's actual folder path, including the 'data' folder
    script_dir = os.path.dirname(os.path.abspath(__file__))
    osm_path = os.path.join(script_dir, "data", "campus.osm")
    
    print(f"Looking for campus.osm at: {osm_path}")
    
    if os.path.exists(osm_path):
        try:
            print("File found! Parsing XML graph via OSMnx...")
            G = ox.graph_from_xml(osm_path, retain_all=True, simplify=True)
            print(f"SUCCESS: Graph loaded from campus.osm! Nodes: {len(G.nodes)}, Edges: {len(G.edges)}")
            return
        except Exception as e:
            print(f"WARNING: Failed to parse local campus.osm file. Error: {e}")
            print("Switching to automated bbox download fallback...")

    # Fallback using correct osmnx bbox tuple format: (north, south, east, west)
    try:
        print("Downloading network map dynamically from OpenStreetMap boundaries...")
        bbox = (23.2000, 23.1500, 80.0500, 80.0000) # north, south, east, west
        G = ox.graph_from_bbox(bbox, network_type='all', simplify=True)
        print(f"SUCCESS: Graph downloaded via fallback! Nodes: {len(G.nodes)}, Edges: {len(G.edges)}")
    except Exception as e:
        print(f"CRITICAL ERROR: Could not initialize graph. {e}")
        G = None

@app.post("/api/route")
def calculate_dijkstra_route(payload: RouteRequest):
    global G
    if G is None:
        raise HTTPException(status_code=500, detail="Road network graph is not loaded on the server.")
    
    start_id = payload.start_node
    end_id = payload.end_node
    
    start_lat_lon = BUILDING_COORDS.get(start_id)
    end_lat_lon = BUILDING_COORDS.get(end_id)
    
    if not start_lat_lon or not end_lat_lon:
        raise HTTPException(status_code=400, detail=f"Invalid node identifiers: {start_id}, {end_id}")
    
    try:
        orig_node = ox.nearest_nodes(G, X=start_lat_lon[1], Y=start_lat_lon[0])
        dest_node = ox.nearest_nodes(G, X=end_lat_lon[1], Y=end_lat_lon[0])
        
        route_node_ids = nx.shortest_path(G, orig_node, dest_node, weight='length', method='dijkstra')
        route_length_meters = nx.shortest_path_length(G, orig_node, dest_node, weight='length', method='dijkstra')
        
        coordinates_list = [{"latitude": G.nodes[n]['y'], "longitude": G.nodes[n]['x']} for n in route_node_ids]
        estimated_minutes = round(route_length_meters / 84.0, 1)
        
        return {
            "success": True,
            "distance_meters": route_length_meters,
            "estimated_time_minutes": estimated_minutes,
            "coordinates": coordinates_list
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dijkstra calculation failed: {str(e)}")

@app.get("/")
def health_check():
    return {"status": "online", "graph_loaded": G is not None}