"""GeoJSON to GTFS."""
import copy
import csv
import datetime
import os
import geojson
import haversine
import argparse
import json

def timefmt(t):
  return t.strftime('%H:%M:%S')  

def minutes(t):
  return datetime.timedelta(minutes=t)

def seconds(t):
  return datetime.timedelta(seconds=t)

def hours(t):
  return datetime.timedelta(hours=t)

class StopTime(dict):
  # "trip_id","arrival_time","departure_time","stop_id","stop_sequence","stop_headsign","pickup_type","drop_off_type","shape_dist_traveled"
  pass

class Trip(dict):
  def add_stop(self, stop_id, arrival_time, departure_time=None, stop_sequence=None):
    if 'stop_times' not in self:
      self['stop_times'] = []
    stop_sequence = stop_sequence or len(self['stop_times']) + 1
    stop_time = StopTime(arrival_time=arrival_time, departure_time=(departure_time or arrival_time), stop_id=stop_id, stop_sequence=stop_sequence)
    self['stop_times'].append(stop_time)

class Stop(geojson.Feature):
  pass

class Route(geojson.Feature):
  def add_trip_speed(self, route_id, stop_ids, start, speed, stops, direction_id=0, trip_id=None):
    # An "anonymous" trip will have an ID assigned at GTFS write time.
    if 'trips' not in self.properties:
      self.properties['trips'] = []
    trip = Trip(trip_id=trip_id, service_id=1, trip_headsign="ok", direction_id=direction_id)
    stop_times = []
    dtotal = 0
    ttotal = seconds(0)
    s = [stops[i] for i in stop_ids]
    # Use stop 0 -> stop 0 to set initial stop_time
    for a,b in zip([s[0]]+s[0:-1], s):
      d = haversine.haversine(a.geometry.coordinates, b.geometry.coordinates)
      t = hours(d/speed)
      dtotal += d
      ttotal += t
      # print a['stop_id'], "->", b['stop_id'], "segment:", d, "time:", t, "traveled:", dtotal, "elapsed:", ttotal, "wall:", start+ttotal
      trip.add_stop(stop_id=b.properties['stop_id'], arrival_time=timefmt(start+ttotal))
    print "-----"
    print "Total time:", ttotal
    print "Total distance:", dtotal
    self.properties['trips'].append(trip)

class Schedule(object):
  def __init__(self, agency_id, agency_name=None, agency_url="http://www.example.com", agency_timezone="America/Los_Angeles"):
    self.agency_id = agency_id
    self.agency_name = agency_name or agency_id
    self.agency_url = agency_url
    self.agency_timezone = agency_timezone
    self.routes = {}
    self.stops = {}
    self.stops_index = {}
  
  def add_stop(self, stop):
    """Add a stop to the schedule."""
    p = tuple(stop.geometry['coordinates'])
    if p in self.stops_index:
      return self.stops_index[p]
    stop.properties['stop_id'] = stop.properties.get('stop_id') or max([0]+self.stops.keys()) + 1
    if stop.properties['stop_id'] in self.stops:
      return self.stops[stop.properties['stop_id']]
    #
    stop.properties['stop_name'] = stop.properties.get('stop_name') or stop.properties['stop_id']
    self.stops[stop.properties['stop_id']] = stop
    self.stops_index[p] = stop
    return stop
  
  def add_route(self, route):
    """Add a route to the schedule."""
    route.properties['route_id'] = route.properties.get('route_id') or max([0]+self.routes.keys()) + 1
    if route.properties['route_id'] in self.routes:
      return self.routes[route.properties['route_id']]
    #
    route.properties['route_short_name'] = route.properties.get('route_short_name') or route.properties['route_id']
    route.properties['route_long_name'] = route.properties.get('route_long_name') or route.properties['route_id']
    if not route.properties.get('stop_ids'):
      route.properties['stop_ids'] = [self.add_stop(Stop(geometry=geojson.Point(stop))).properties['stop_id'] for stop in route.geometry.coordinates]
    self.routes[route.properties['route_id']] = route
    return route
  
  def _assign_trip_ids(self):
    """Assign trip_ids where missing."""
    all_trip_ids = []
    for route in self.routes.values():
      all_trip_ids += [i['trip_id'] for i in route.properties['trips']]
    all_trip_ids = filter(None, all_trip_ids)
    count = max([0]+all_trip_ids) + 1
    for route in self.routes.values():
      for trip in route.properties['trips']:
        if trip['trip_id'] is None:
          trip['trip_id'] = count
          count += 1
  
  def write(self, path='.'):
    """Write GTFS output."""
    self._assign_trip_ids()
    
    # Write results.
    with open(os.path.join(path, 'agency.txt'), 'wb') as f:
      writer = csv.writer(f, delimiter=',', quotechar='"', quoting=csv.QUOTE_ALL)
      writer.writerow(["agency_id", "agency_name", "agency_url", "agency_timezone"])
      writer.writerow([self.agency_id, self.agency_name, self.agency_url, self.agency_timezone])
  
    with open(os.path.join(path, 'calendar.txt'), 'wb') as f:
      writer = csv.writer(f, delimiter=',', quotechar='"', quoting=csv.QUOTE_ALL)
      writer.writerow(["service_id","monday","tuesday","wednesday","thursday","friday","saturday","sunday","start_date","end_date"])
      writer.writerow(["1","1","1","1","1","1","1","1","20100101","20200101"])

    with open(os.path.join(path, 'fare_attributes.txt'), 'wb') as f:
      writer = csv.writer(f, delimiter=',', quotechar='"', quoting=csv.QUOTE_ALL)
      writer.writerow(["fare_id","price","currency_type","payment_method","transfers","transfer_duration"])
      writer.writerow(["1","2","USD","0","0",""])

    with open(os.path.join(path, 'fare_rules.txt'), 'wb') as f:
      writer = csv.writer(f, delimiter=',', quotechar='"', quoting=csv.QUOTE_ALL)
      writer.writerow(["fare_id","route_id","origin_id","destination_id","contains_id"])
      for route in self.routes.values():
        writer.writerow(["1", route.properties['route_id'], "", "", ""])

    with open(os.path.join(path, 'routes.txt'), 'wb') as f:
      writer = csv.writer(f, delimiter=',', quotechar='"', quoting=csv.QUOTE_ALL)
      writer.writerow(["route_id","agency_id","route_short_name","route_long_name","route_desc","route_type","route_url","route_color","route_text_color"])
      for route in self.routes.values():
        writer.writerow([route.properties['route_id'], self.agency_id, "", route.properties['route_short_name'], route.properties['route_long_name'], "3", "", "", ""])

    with open(os.path.join(path, 'trips.txt'), 'wb') as f:
      writer = csv.writer(f, delimiter=',', quotechar='"', quoting=csv.QUOTE_ALL)
      writer.writerow(["route_id","service_id","trip_id","trip_headsign","direction_id","block_id"])
      for route in self.routes.values():      
        for trip in route.properties['trips']:
          writer.writerow([route.properties['route_id'], trip['service_id'], trip['trip_id'], trip['trip_headsign'] or route['route_short_name'], trip['direction_id'], ""])

    with open(os.path.join(path, 'stop_times.txt'), 'wb') as f:
      writer = csv.writer(f, delimiter=',', quotechar='"', quoting=csv.QUOTE_ALL)
      writer.writerow(["trip_id","arrival_time","departure_time","stop_id","stop_sequence","stop_headsign","pickup_type","drop_off_type","shape_dist_traveled"])
      for route in self.routes.values():      
        for trip in route.properties['trips']:
          # arrival_time, departure_time or arrival_time, stop_id, stop_sequence
          for i in trip['stop_times']:
            writer.writerow([trip['trip_id'], i['arrival_time'], i['departure_time'], i['stop_id'], i['stop_sequence'], "", "", "", ""])
            
    with open(os.path.join(path, 'stops.txt'), 'wb') as f:
      writer = csv.writer(f, delimiter=',', quotechar='"', quoting=csv.QUOTE_ALL)
      writer.writerow(["stop_id","stop_name","stop_desc","stop_lat","stop_lon","zone_id"])
      for stop in self.stops.values():
        writer.writerow([stop.properties['stop_id'], stop.properties['stop_name'], '', stop.geometry['coordinates'][1], stop.geometry['coordinates'][0], '1'])


if __name__ == "__main__":
  parser = argparse.ArgumentParser()
  parser.add_argument("agency")
  parser.add_argument("filename", help="GTFS geojson")
  parser.add_argument("output", help="GTFS output directory")
  args = parser.parse_args()

  # Read the geoJSON file, create the stops and routes.  
  with open(args.filename) as f:
    data = json.load(f)

  # Filter
  stops = [Stop(**i) for i in data['features'] if i['geometry']['type'] == 'Point']
  routes = [Route(**i) for i in data['features'] if i['geometry']['type'] == 'LineString']

  sched = Schedule(agency_id=args.agency)
  for stop in stops:
    # Add stop
    sched.add_stop(stop)

  for route in routes:
    # Check all stops exist
    sched.add_route(route)

  start = datetime.datetime.now().replace(hour=5, minute=0, second=0, microsecond=0)
  end = datetime.datetime.now().replace(hour=20, minute=0, second=0, microsecond=0)

  # Add trips
  for route in sched.routes.values():
    headway = seconds(route.properties.get('headway'))
    speed = route.properties.get('speed')
    now = copy.copy(start)
    print "Route: %s, speed: %s, headway: %s"%(route.properties['route_id'], speed, headway)
    while now <= end:
      route.add_trip_speed(route_id=route.properties['route_id'], stop_ids=route.properties['stop_ids'], direction_id=0, start=now, speed=speed, stops=sched.stops)
      route.add_trip_speed(route_id=route.properties['route_id'], stop_ids=route.properties['stop_ids'][::-1], direction_id=1, start=now, speed=speed, stops=sched.stops)
      now += headway

  sched.write(path=args.output)
