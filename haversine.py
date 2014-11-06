import math

def haversine(point1, point2, miles=False): # lon1, lat1, lon2, lat2):
    """
    Calculate the great circle distance between two points 
    on the earth (specified in decimal degrees)
    """
    # convert decimal degrees to radians     
    lon1, lat1 = map(math.radians, point1)
    lon2, lat2 = map(math.radians, point2)

    # haversine formula 
    dlon = lon2 - lon1 
    dlat = lat2 - lat1 
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a)) 

    # 6371 km is the radius of the Earth
    km = 6371 * c
    if miles:
      return km / 1.60934 
    return km 
    
# feature = {'type': 'LineString', 'coordinates': [[-121.88644409179688, 37.29699797218557], [-121.80198669433592, 37.298090424438506]]}
# print haversine(feature['coordinates'][0], feature['coordinates'][1])