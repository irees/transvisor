"""GTFS to GeoJSON."""
import collections
import numpy
import json
import argparse
import pprint

# PyGTFS is required.
import pygtfs
# frewsxcv/python-geojson
import geojson

def route_from_stops(stops, planner):
  import cityism.planner
  # Flip from lon/lat -> lat/lon
  route = []
  otp = cityism.planner.getplanner(planner)
  flip = map(lambda x:(x[1],x[0]), stops)
  for i in range(len(flip)-1):
    start = flip[i]
    end = flip[i+1]
    a, _ = otp.plan(start=start, end=end)
    route.extend(a)  
  return route

##### Routes #####
  
def route_as_geo(route, trips, properties=None, sched=None, planner=None):
  points = []
  # Check if we have shapes.txt...
  trip = trips[0]
  if trip.shape_id:
    # Ok, hacky patch to pygtfs to pull it out of the sqlite-sqlalchemy db.
    q = sched.session.query(pygtfs.gtfs_entities.ShapePoint).filter_by(shape_id=trip.shape_id)
    for stop in q.all():
      points.append((stop.shape_pt_lon, stop.shape_pt_lat))
  else:
    # Otherwise, reconstruct the route based on stop locations.
    stops = [(stop.stop.stop_lon, stop.stop.stop_lat) for stop in trip.stop_times]
    if planner:
      # Try to use a trip planner
      stops = route_from_stops(stops, planner=planner)
    for lon,lat in stops:
      # Otherwise, just a simple line
      points.append((lon,lat))
  # Create the GeoJSON feature.
  f = geojson.Feature(properties=properties, geometry=geojson.LineString(points))
  return f

def stop_as_geo(stop):
  # f = geojson.Feature(name=str(stop), typegeom='Point')
  return geojson.Feature(geometry=geojson.Point((stop.stop_lon, stop.stop_lat)), properties={'name':str(stop), 'stop_id':stop.stop_id})
    
##### Main #####
  
def route_info(route, sched=None, planner=False, includetrips=False):
  print "\n===== Route %s: %s ====="%(route.route_short_name, route.route_long_name)
  
  # Filter by Monday service for now...
  trips = filter(lambda x:getattr(x.service, 'monday', None), route.trips)
    
  # Find each route by the sequence of stops...
  unfurled = {}
  for trip in trips:
    trip.stop_times = sorted(trip.stop_times, key=lambda x:x.stop_sequence)
    # s = tuple(i.stop_id for i in trip.stop_times)
    # s = trip.direction_id
    s = (trip.shape_id, trip.direction_id)
    if s not in unfurled:
      unfurled[s] = []
    unfurled[s].append(trip)

  for key,trips in unfurled.items():
    trips = sorted(trips, key=lambda trip:(trip.stop_times[0].arrival_time.seconds))
    print "----- Route Group -----"
    print key
    test_shape_id = set([trip.shape_id for trip in trips])
    test_headsign = set([trip.trip_headsign for trip in trips])
    test_times = [str(trip.stop_times[0].arrival_time) for trip in trips]

    # Make sure all headsigns and shapes match
    try:
      assert len(test_shape_id) == 1
    except AssertionError:
      print "Warning: More than one shape_id!"
    try:
      assert len(test_headsign) == 1
    except AssertionError:
      print "Warning: More than one headsign!"
      
    # Include the trip schedule.
    # Since stop sequence is identical, just store times
    # Trip start times
    r = {}
    r['route_type'] = route.route_type
    r['agency_id'] = route.agency_id
    r['route_desc'] = route.route_desc
    r['route_long_name'] = route.route_long_name
    r['route_short_name'] = route.route_short_name
    r['route_shape_id'] = trips[0].shape_id
    r['trip_headsign'] = trips[0].trip_headsign
    r['direction_id'] = trips[0].direction_id
    
    if includetrips:
      r['trips'] = []
      for trip in trips:
        t = {'trip_id': trip.trip_id, 'service_id': trip.service_id, 'trip_headsign': trip.trip_headsign, 'direction_id': trip.direction_id}
        t['stop_times'] = [{'arrival_time':getattr(stop.arrival_time, 'seconds', None), 'stop_id':stop.stop_id, 'stop_sequence':stop.stop_sequence} for stop in trip[0].stop_times]
        r['trips'].append(t)
    #   r['route_stops']    = [stop.stop_id for stop in trips[0].stop_times]
    #   r['route_schedule'] = [[getattr(stop.arrival_time, 'seconds', None) for stop in trip.stop_times] for trip in trips]
    #   r['trip_starts'] = [trip.stop_times[0].arrival_time.seconds for trip in trips]

    yield route_as_geo(route=route, trips=trips, properties=r, sched=sched, planner=planner)

    
if __name__ == "__main__":
  parser = argparse.ArgumentParser()
  parser.add_argument("filename", help="GTFS .zip file, or cached sqlite DB.")
  parser.add_argument("--output", help="GeoJSON output file.")
  parser.add_argument("--route", help="Run for route; helpful for debugging.", action="append")
  parser.add_argument("--stops", help="Include stopss in output.", action="store_true")
  parser.add_argument("--exclude", help="Exclude routes", action="append")
  parser.add_argument("--planner", help="Reconstruct routes using a trip planner: osrm or otp")
  parser.add_argument("--trips", help="Include trip details", action="store_true")

  args = parser.parse_args()
  filename = args.filename
  output = args.output
  
  # Open the GTFS .zip or cache-y sqlite version.
  if filename.endswith(".db"):
    sched = pygtfs.Schedule(filename)
  elif filename.endswith(".zip"):
    sched = pygtfs.Schedule(":memory:")
    pygtfs.append_feed(sched, filename)

  # Get routes
  routes = sched.routes
  if args.route:
    routes = [i for i in sched.routes if i.route_id in args.route]
  if args.exclude:
    routes = [i for i in sched.routes if i.route_id not in args.exclude]

  # Calculate route stats and add to collection
  c = []
  for route in routes:
    for f in route_info(route, sched=sched, planner=args.planner, includetrips=args.trips):
      c.append(f)

  if args.stops:
    # Gather all the stops
    stops = set()
    for route in routes:
      for trip in route.trips:
        for stop in trip.stop_times:
          stops.add(stop.stop)
    for stop in stops:
      c.append(stop_as_geo(stop))

  # Write the geojson output.
  if args.output:
    with open(args.output, "w") as f:
      geojson.dump(geojson.FeatureCollection(c), f)
    
