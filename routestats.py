import numpy
import collections
import pygtfs
import sys

stops = collections.defaultdict(int)

sched = pygtfs.Schedule(sys.argv[1])
for r in sched.routes_by_id(sys.argv[2]):
  durations = []
  trips = r.trips
  for trip in trips:
    trip.stop_times = sorted(trip.stop_times, key=lambda x:x.stop_sequence)

  trips = sorted(trips, key=lambda x:x.stop_times[0].arrival_time)
  for trip in trips:
    start = trip.stop_times[0].arrival_time
    end = trip.stop_times[-1].arrival_time
    duration = (end - start).seconds
    durations.append(duration)
    key = tuple(i.stop_id for i in trip.stop_times)
    stops[key] += 1
    print "Start:", start, "End:", end, "Duration:", duration

  print "Median duration:", numpy.median(durations)
    
for k,v in sorted(stops.items(), key=lambda x:x[1]):
  print "=== %s stops, %s trip ==="%(len(k), v)
  print k
