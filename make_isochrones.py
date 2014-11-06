import argparse
import json
import urllib
import urllib2
import geojson

def fjoin(a):
  return ",".join(map(str, a))

def getjson(endpoint, method, **kwargs):
  params = urllib.urlencode(kwargs, doseq=True)
  print '%s/%s?%s'%(endpoint, method, params)
  response = urllib2.urlopen('%s/%s?%s'%(endpoint, method, params)).read()
  return json.loads(response)

def postjson(endpoint, method, **kwargs):
  params = urllib.urlencode(kwargs, doseq=True)
  response = urllib2.urlopen('%s/%s?%s'%(endpoint, method, params), '').read()
  return json.loads(response)

if __name__ == "__main__":
  parser = argparse.ArgumentParser()
  parser.add_argument("--otphost", help="OTP Host", default="http://localhost:8080")
  parser.add_argument("--tripdate", help="Trip date", default="10/06/14")
  parser.add_argument("--triptime", help="Trip time", default="08:00:00")
  parser.add_argument("--cutoff", help="Cutoff time, in minutes", default=90, type=int)
  parser.add_argument("--spacing", help="Spacing time, in minutes", default=5, type=int)
  parser.add_argument("--stops", help="Stop data", default="data/vta-brt-stops.json")
  parser.add_argument("dataset", help="Dataset")
  parser.add_argument("stop_ids", help="Stop IDs to create isochrones", nargs='*')
  args = parser.parse_args()

  with open(args.stops) as f:
    data = json.load(f)
  stops = data
  # stops = filter(lambda x:x['geometry']['type'] == 'Point', data['features'])

  stop_ids = [i['stop_id'] for i in stops]
  print "Known stop_ids:", ", ".join(stop_ids)
  args.stop_ids = args.stop_ids or stop_ids
  print "Using stop_ids:", ", ".join(args.stop_ids)
  
  SCENARIOS = [
    ['vta-brt-alt1', 'vta-brt-alt4c', 'vta-ns'],  # Current
    ['vta-brt-alt1'], # Current + Alt 4c + NS
    ['vta-brt-alt1', 'vta-ns'], # Current + Alt 4c
    ['vta-brt-alt1', 'vta-brt-alt4c'], # Current + NS
    ['vta-brt-alt4c'], # Current + Alt 1 + NS
    ['vta-brt-alt4c', 'vta-ns'] # Current + Alt 1
  ]
  
  stops = [stop for stop in stops if stop['stop_id'] in args.stop_ids]
  for stop in stops:
    print "======= Creating isochrone for stop:", stop
    for count, banned in enumerate(SCENARIOS):
      print "Trying with banned:", banned

      surface = postjson(args.otphost,
        "otp/surfaces",
        fromPlace=fjoin([stop['stop_lat'], stop['stop_lon']]),
        bannedAgencies=banned,
        cutoffMinutes=args.cutoff,
        date=args.tripdate,
        time=args.triptime,
        batch=True)
      print "Surface:", surface['id']

      isochrone = getjson(args.otphost, "otp/surfaces/%s/isochrone"%surface['id'], spacing=args.spacing)
      with open('cache/%s.%s.%s.isochrones.geojson'%(args.dataset, count, stop['stop_id']), 'wb') as f:
        json.dump(isochrone, f)
      
      indicators = getjson(args.otphost, 'otp/surfaces/%s/indicator'%surface['id'], targets='census.geo')
      with open('cache/%s.%s.%s.indicators.json'%(args.dataset, count, stop['stop_id']), 'wb') as f:
        json.dump(indicators, f)

