
/***** Utility functions *****/

// Colors: colorbrewer2.org
// var colors = [
//   '#d73027',
//   '#fc8d59',
//   '#fee090',
//   '#e0f3f8',
//   '#91bfdb',
//   '#4575b4'
// ].reverse();
var colors = [
'#eff3ff',
'#c6dbef',
'#9ecae1',
'#6baed6',
'#3182bd',
'#08519c',
].reverse()


// Level of Service definitions.
var LOS = [{
  name: ' ',
  label: 'No service',
  min: 7200,
  max: Infinity,
  color: '#ccc',
}, {
  name: 'F',
  label: 'F: >60 min',
  min: 3600,
  max: 7200,
  color: colors[5],
}, {
  name: 'E',
  label: 'E: 60 min',
  min: 1800,
  max: 3600,
  color: colors[4],
}, {
  name: 'D',
  label: 'D: 30 min',
  min: 1200,
  max: 1800,
  color: colors[3],
}, {
  name: 'C',
  label: 'C: 20 min',
  min: 900,
  max: 1200,
  color: colors[2],
}, {
  name: 'B',
  label: 'B: 15 min',
  min: 600,
  max: 900,
  color: colors[1],
}, {
  name: 'A',
  label: 'A: 10 min',
  min: -1,
  max: 600,
  color: colors[0],
}
];
// Find a sortable route number.
// Allow a single leading letter, e.g. NYC MTA M1 as 1.
// ... but only a single, so not to e.g. AC Transit NX1 sort as 1.
var re_route_sort = /^(\D)?(\d+)/;

function route_sort(a,b){
  if (a.route_sort == b.route_sort) {
      return a.route_short_name > b.route_short_name ? 1 : -1;        
  }
  return a.route_sort > b.route_sort ? 1 : -1;
}
      
function seconds_to_clock(t) {
  function pad(a,b){return([1e15]+a).slice(-b)}
  var h = Math.floor(t/3600);
  var m = Math.floor((t%3600)/60);
  return pad(h,2)+':'+pad(m,2)
}

function get_qs(name) {
  name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
  var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
    results = regex.exec(location.search);
  return results == null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

/***** Models *****/

var Trip = Backbone.Model.extend({
  // Trip represents a set of trips that have the same stop sequence.
  // This is somewhat inverted from GTFS to simplify the GeoJSON.
  defaults: {
    los: 0,
    los_trips: [],
    display: true,
    color: '#ccc'
  },
  initialize: function(options) {
    // this.calc(options);
  },
  calc: function(start, end) {
    console.log(start, end);
    var los_trips = this.calc_trips(start, end);
    var los = this.calc_los(start, end, los_trips);
    var color = LOS[los].color;
    this.set('los_trips', los_trips);
    this.set('los', los);
    this.set('color', color);
  },
  calc_trips: function(start, end) {
    // Calculate Level of Service.
    var starts = this.get('properties').trip_starts.filter(function(i) {
      return i > start && i <= end
    });
    return starts
  },
  calc_los: function(start, end, starts) {
    // Buses per hour
    var headway = ((end-start)/3600 / starts.length) * 3600;
    // Find the LOS.
    for (var i in LOS) {
      if (headway > LOS[i].min && headway <= LOS[i].max) {
        return i
      }
    }
    return i
  },
  get_style: function() {
    var style =  {
      weight: 4.0,
      opacity: 1.0,
      lineCap: 'butt',      
      color: this.get('color')
    }
    if (this.get('properties').route_type < 3) {
      style['weight'] = 10;
      style['dashArray'] = "2,5";
      style['lineJoin'] = 'miter';
    }
    return style
  }
});

/***** Collections *****/

var TripCollection = Backbone.Collection.extend({
  // A Route is a set of related Trips, e.g. by headsign or route description.
  model: Trip  
});

var AgencyCollection = Backbone.Collection.extend({
  // All  of the Trips for an Agency.
  model: Trip,
  url: 'data/test.geojson',
  parse: function(response) {
    return response.features;
  }
});

/***** Views *****/

var TripView = Backbone.View.extend({
  /***** Trip View *****/
  tagName: "li",
  template: _.template('<span><%- properties.trip_headsign %></span><input type="checkbox" class="transvisor-trip-toggle transvisor-float-right" checked="checked" /><span class="transvisor-trip-color transvisor-float-right">LOS</span><span class="transvisor-trip-hours transvisor-float-right"></span></span>'),
  events: {
    "click .transvisor-trip-toggle": "toggle",
  },
  initialize: function() {
    this.listenTo(this.model, 'change:display', this.check_display);    
    this.listenTo(this.model, 'change:color', this.check_color);    
  },
  render: function() {
    this.$el.html(this.template(this.model.attributes));
    this.check_color(); // Set the initial color
    // this.check_schedule(); // Set the service hours
    return this;
  },
  check_display: function() {
    this.$('.transvisor-trip-toggle')
      .prop('checked', this.model.get('display'));
  },
  check_color: function() {
    this.$('.transvisor-trip-color')
      .text(LOS[this.model.get('los')].label)
      .css('background-color', this.model.get('color'));
  },
  check_schedule: function() {
    var schedule = this.model.get('properties').route_schedule;
    var starts = schedule.map(function(i){return i[0]});
    var ends = schedule.map(function(i){return i[i.length-1]});
    var start = Math.min.apply(null, starts);
    var end = Math.min.apply(null, ends);
    this.$('.transvisor-trip-hours').text(
      seconds_to_clock(start) + " - " + seconds_to_clock(end)
    )
  },
  toggle: function(e) {
    e.preventDefault();
    this.model.set('display', !this.model.get('display'))
  }  
});

var TripMapView = Backbone.View.extend({
  /***** Map View *****/
  initialize: function() {
    this.listenTo(this.model, 'change:display', this.set_display);
    this.listenTo(this.model, 'change:color', this.set_color);
  },
  render: function() {
    this.layer = L.geoJson(this.model.attributes, {
      style: this.model.get_style()
    });
    return this.layer
  },
  set_display: function(e) {
    this.model.get('display') ? this.show() : this.hide();
  },
  set_color: function(e) {
    this.show();
  },
  // Update view.
  show: function(e) {
    this.layer.setStyle(this.model.get_style());
  },
  hide: function(e) {
    this.layer.setStyle({opacity: 0.0});
  }
});

var RouteView = Backbone.View.extend({
  /***** Route View *****/
  // View for a related set of Trips.
  className: 'transvisor-route',
  template: _.template('<div class="transvisor-route-info"><input type="checkbox" class="transvisor-route-toggle" checked="checked" /><span class="transvisor-route-short"><%- route_short_name %></span> <span class="transvisor-route-long"><%- route_long_name %></span></div><div class="transvisor-route-controls"><button class="transvisor-route-show_all">All</button><button class="transvisor-route-show_only">Only </button></div><div class="transvisor-route-trips"><p class="transvisor-route-direction">INBOUND</p><ul class="transvisor-route-inbound"></ul><p class="transvisor-route-direction">OUTBOUND</p><ul class="transvisor-route-outbound"></ul></div>'),
  events: {
    "click .transvisor-route-show_only": "show_only", 
    "click .transvisor-route-show_all": "show_all", 
    "click .transvisor-route-toggle": "toggle_trips",   
    "click .transvisor-route-info": "toggle_expand",
  },
  initialize: function(options) {
    // Display this group?
    this.display = true;
    // Route number
    this.route_short_name = options.route_short_name;
    this.route_long_name = options.route_long_name;

    this.route_sort = 0;
    var m = re_route_sort.exec(this.route_short_name);
    if (m) {
      this.route_sort = parseInt(m[2])
    }
    // Trip collection
    this.collection = new TripCollection();
    // Listen for new Trips, and changes in Trip display.
    this.listenTo(this.collection, 'add', this.add_trip);
    this.listenTo(this.collection, 'change:display', this.check_display);
  },
  render: function() {
    // Render the template.
    this.$el.html(this.template(this));
    return this;
  },
  add_trip: function(trip) {
    // Add a view for the Trip
    var view = new TripView({model: trip});
    // Add to the inbound or outbound list.
    var el = this.$(".transvisor-route-inbound");
    if (trip.get('properties').direction_id == 1) {
      var el = this.$(".transvisor-route-outbound");      
    }
    el.append(view.render().el);
  },
  // 
  check_display: function() {
    // Update the Route checkbox, depending on the state of the Trips.
    console.log("check_display");
    var display = this.collection.filter(function(trip){
      return trip.get('display')
    });
    var toggle = this.$('.transvisor-route-toggle');
    toggle.prop('indeterminate', false);
    if (display.length == 0) {
      toggle.prop('checked', false);
    } else if (display.length == this.collection.length) {
      toggle.prop('checked', true);
    } else {
      toggle.prop('indeterminate', true);
    }
  },
  fit_zoom: function() {
    // TODO
  },
  show_only: function() {
    // Trigger "only" event, which should hide all other Routes.
    this.trigger("hide_all", this);
    this.collection.each(function(i){i.set('display', true)});    
    this.fit_zoom();
  },
  hide_all: function() {
    this.trigger("hide_all", this);
  },
  show_all: function() {
    this.trigger("show_all", this);
  },
  toggle_expand: function() {
    this.$('.transvisor-route-trips').toggle();    
  },
  toggle_trips: function(e) {
    e.stopPropagation();
    var display = this.$('.transvisor-route-toggle').prop('checked');
    this.collection.each(function(i){i.set('display', display)});
  },
});

var TransvisorApp = Backbone.View.extend({
  /***** App Controller *****/
  initialize: function(options) {
    this.start = options.start || 7 * 3600;
    this.end = options.end || 9 * 3600;
    // RouteViews
    this.routeviews = [];
    // MapViews
    this.mapviews = [];
    // AgencyCollection.
    this.collection = new AgencyCollection();
    this.collection.url = options.url;
    // The Leaflet map, and layer group.
    this.leaflet = options.leaflet;
    this.layer = new L.LayerGroup().addTo(this.leaflet); 
    // Listen for new Trips and AgencyCollection load completion.
    this.listenTo(this.collection, 'add', this.add_to_route);
    this.listenTo(this.collection, 'add', this.add_to_map);
    this.listenTo(this.collection, 'sync', this.reorder_layers);
    this.listenTo(this.collection, 'sync', this.fit_all);
    // Load the data.
    this.collection.fetch();
  },
  add_to_route: function(trip) {
    // Calculate LOS...
    trip.calc(this.start, this.end);    
    // Add the Trip to the RouteView.
    var route_short_name = trip.get('properties').route_short_name;
    var route_long_name = trip.get('properties').route_long_name;
    // Check if we have a RouteView for this Trip's route_short_name.
    var view = _.find(this.routeviews, function(i){
      return i.route_short_name == route_short_name
    });
    if (!view) {
      // Create a new RouteView.
      view = new RouteView({
        route_short_name: route_short_name, 
        route_long_name: route_long_name
      });
      // Add event handlers.
      this.listenTo(view, 'hide_all', this.hide_all);
      this.listenTo(view, 'show_all', this.show_all);
      // Add to the list of Routes
      this.routeviews.push(view);
      // Resort
      this.routeviews = this.routeviews.sort(route_sort);
      // Insert the RouteView into the DOM in the right position.
      var viewindex = this.routeviews.indexOf(view);
      if (viewindex > 0) {
        this.routeviews[viewindex-1].$el.after(view.render().el)
      } else {
        view.render().$el.appendTo(this.$el);
      }
    }
    // Finally, add it to the routeview.
    view.collection.add(trip)
  },
  add_to_map: function(trip) {
    // And also add a second View for the map layer.
    var view = new TripMapView({model: trip});
    this.mapviews.push(view);
    this.layer.addLayer(view.render());
  },
  hide_all: function() {
    // Hide all Trips.
    this.collection.each(function(i){i.set('display', false)});    
  },
  show_all: function() {
    // Show all Trips.
    this.collection.each(function(i){i.set('display', true)});    
  },
  reorder_layers: function(key) {
    // Reorder the layers based on Level of Service.
    var key = 'los';
    this.mapviews.sort(function(a,b){
      return a.model.get(key) > b.model.get(key) ? 1 : -1
    });
    // hax0r
    for (var i in this.mapviews) {
      this.mapviews[i].layer.bringToFront();
    }
  },
  fit_all: function() {
    // Fit all routes within the map.
    var max_ne = 0;
    var max_sw = 0;
    var bounds = null;
    // Expand the bounds to include all layers.
    this.layer.eachLayer(function(i){
      if (bounds==null) {bounds=i.getBounds()}
      bounds.extend(i.getBounds());
    });
    this.leaflet.fitBounds(bounds);
  }
});


