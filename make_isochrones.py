import argparse
import json
import urllib
import urllib2
import geojson
import os
def fjoin(a):
  return ",".join(map(str, a))

def getjson(endpoint, method, **kwargs):
  params = urllib.urlencode(kwargs, doseq=True)
  print '%s/%s?%s'%(endpoint, method, params)
  response = urllib2.urlopen('%s/%s?%s'%(endpoint, method, params)).read()
  return json.loads(response)

def postjson(endpoint, method, **kwargs):
  params = urllib.urlencode(kwargs, doseq=True)
  print '%s/%s?%s'%(endpoint, method, params)
  response = urllib2.urlopen('%s/%s?%s'%(endpoint, method, params), '').read()
  return json.loads(response)

if __name__ == "__main__":
  parser = argparse.ArgumentParser()
  parser.add_argument("--host", help="OTP Host", default="http://localhost:8080")
  parser.add_argument("--date", help="Trip date", default="10/06/14")
  parser.add_argument("--time", help="Trip time", default="08:00:00")
  parser.add_argument("--cutoff", help="Cutoff time, in minutes", default=90, type=int)
  parser.add_argument("--spacing", help="Spacing time, in minutes", default=5, type=int)
  parser.add_argument("--outdir", help="Output directory", default="cache")
  parser.add_argument("--banned", help="Banned agencies", action="append")
  parser.add_argument("--scenario", help="Scenario name", default="test")
  parser.add_argument("--stop_data", help="Stop data")
  parser.add_argument("--stop_ids", help="Stop IDs", action="append")
  args = parser.parse_args()

  with open(args.stop_data) as f:
    data = json.load(f)
  stops = data
  # stops = filter(lambda x:x['geometry']['type'] == 'Point', data['features'])

  stop_ids = [i['stop_id'] for i in stops]
  print "Known stop_ids:", ", ".join(stop_ids)
  args.stop_ids = args.stop_ids or stop_ids
  print "Using stop_ids:", ", ".join(args.stop_ids)

  args.banned = args.banned or []
  
  stops = [stop for stop in stops if stop['stop_id'] in args.stop_ids]
  for stop in stops:
    print "======= Creating isochrone for stop:", stop
    print "Trying with banned:", args.banned
    kw = {}
    if args.banned:
      kw['bannedAgencies'] = ",".join(args.banned)
      
    surface = postjson(args.host,
      "otp/surfaces",
      fromPlace=fjoin([stop['stop_lat'], stop['stop_lon']]),
      clampInitialWait=3600,
      cutoffMinutes=args.cutoff,
      date=args.date,
      time=args.time,
      batch=True, **kw)
    print "Surface:", surface['id']

    isochrone = getjson(args.host, "otp/surfaces/%s/isochrone"%surface['id'], spacing=args.spacing)
    with open(os.path.join(args.outdir, '%s.%s.isochrones.geojson'%(args.scenario, stop['stop_id'])), 'wb') as f:
      json.dump(isochrone, f)
    
    indicators = getjson(args.host, 'otp/surfaces/%s/indicator'%surface['id'], targets='census.geo')
    with open(os.path.join(args.outdir, '%s.%s.indicators.json'%(args.scenario, stop['stop_id'])), 'wb') as f:
      json.dump(indicators, f)
