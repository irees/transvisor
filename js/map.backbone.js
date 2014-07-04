// Utility functions.
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
    display: true,
    los: 0
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
  // View for a set of Trips.
  tagName: "li",
  template: _.template('<span><%- properties.trip_headsign %></span><span class="transvisor-float-right">/ <%- properties.direction_id %><input type="checkbox" class="transvisor-toggletrip transvisor-float-right" checked="checked" /></span>'),
  events: {
    "click .transvisor-toggletrip": "toggle",
  },
  initialize: function() {
    this.listenTo(this.model, 'change:display', this.check_display);    
  },
  render: function() {
    this.$el.html(this.template(this.model.attributes));
    return this;
  },
  check_display: function() {
    this.$('.transvisor-toggletrip').prop('checked', this.model.get('display'));
  },
  toggle: function(e) {
    e.preventDefault();
    this.model.set('display', !this.model.get('display'))
  }  
});

var TripMapView = Backbone.View.extend({
  // Map view.
  initialize: function() {
    this.listenTo(this.model, 'change:display', this.set_display);
    // Use the model's ID as the Leaflet layer class suffix.
    this.gclass = 'transvisor-route-' + this.model.cid;
  },
  render: function() {
    this.layer = L.geoJson(this.model.attributes, {
      className: this.gclass
    });
    return this.layer
  },
  // Model updates.
  set_display: function(e) {
    this.model.get('display') ? this.show() : this.hide();
  },
  // Update view.
  show: function(e) {
    $('.'+this.gclass).show();
  },
  hide: function(e) {
    $('.'+this.gclass).hide();
  }
});

var RouteView = Backbone.View.extend({
  // View for a related set of Trips.
  className: 'transvisor-route',
  template: _.template('<div><input type="checkbox" class="transvisor-toggle" checked="checked" /><span class="transvisor-showonly"><%- route_short_name %>: <%- route_long_name %></span></div><ul class="transvisor-hidden transvisor-route-trips"></ul>'),
  events: {
    "click .transvisor-showonly": "showonly",    
    "click .transvisor-showonly": "toggle_expand",
  },
  initialize: function(options) {
    // Display this group?
    this.display = true;
    // Route number
    this.route_short_name = options.route_short_name;
    this.route_long_name = options.route_long_name;
    this.route_sort = parseInt(this.route_short_name);
    if (isNaN(this.route_sort)) {this.route_sort = 0}
    console.log("this.route_sort:", this.route_sort);
    
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
    // Add a trip to the collection, and 
    var view = new TripView({model: trip});
    this.$(".transvisor-route-trips").append(view.render().el);
  },
  // 
  check_display: function() {
    var display = this.collection.filter(function(trip){return trip.get('display')});
    var toggle = this.$('.transvisor-toggle');
    toggle.prop('indeterminate', false);
    if (display.length == 0) {
      toggle.prop('checked', false);
    } else if (display.length == this.collection.length) {
      toggle.prop('checked', true);
    } else {
      toggle.prop('indeterminate', true);
    }
  },
  showonly: function() {
    this.trigger("only", this);
  },
  toggle_expand: function() {
    this.$('.transvisor-route-trips').toggle();    
  },
  toggle_trips: function(e) {
    this.display = !this.display;
    var display = this.display;
    this.collection.each(function(i){i.set('display', display)});    
    e.preventDefault();
  },
});

var TransvisorApp = Backbone.View.extend({
  // App controller.
  initialize: function(options) {
    // RouteViews
    this.routeviews = [];
    // AgencyCollection.
    this.collection = new AgencyCollection();
    this.collection.url = options.url;
    // The Leaflet map, and layer group.
    this.leaflet = options.leaflet;
    this.layer = new L.LayerGroup().addTo(this.leaflet); 
    // Listen for new Trips and AgencyCollection load completion.
    this.listenTo(this.collection, 'add', this.add_to_route);
    this.listenTo(this.collection, 'add', this.add_to_map);
    this.listenTo(this.collection, 'sync', this.fit_all);
    this.collection.fetch();
  },
  add_to_route: function(trip) {
    // Add the Trip to the RouteView.
    var route_short_name = trip.get('properties').route_short_name;
    var route_long_name = trip.get('properties').route_long_name;
    // Check if we have a RouteView for this Trip's route_short_name.
    var view = _.find(this.routeviews, function(i){return i.route_short_name == route_short_name});
    if (!view) {
      view = new RouteView({route_short_name: route_short_name, route_long_name: route_long_name});
      this.routeviews.push(view);
      // Resort
      this.routeviews = this.routeviews.sort(function(a,b){
        if (a.route_sort == b.route_sort) {
            return a.route_short_name > b.route_short_name ? 1 : -1;        
        }
        return a.route_sort > b.route_sort ? 1 : -1;
      });
      console.log("Resorted", this.routeviews.map(function(i){return i.route_sort}));
            
      // Insert the RouteView into the DOM in the right position.
      var viewindex = this.routeviews.indexOf(view);
      console.log("viewindex:", viewindex);
      if (viewindex > 0) {
        console.log(this.routeviews[viewindex].$el);
        this.routeviews[viewindex-1].$el.after(view.render().el)
      } else {
        view.render().$el.appendTo(this.$el);
        //this.$el.append(view.render().el);
      }
    }
    // Finally, add it to the routeview.
    view.collection.add(trip)
  },
  add_to_map: function(trip) {
    // And also add a second View for the map layer.
    var view_map = new TripMapView({model: trip});
    this.layer.addLayer(view_map.render());
  },
  hide_all: function() {
    this.collection.each(function(i){i.set('display', false)});    
  },
  show_all: function() {
    this.collection.each(function(i){i.set('display', true)});    
  },
  only: function(route) {
    this.hide_all();
    route.collection.each(function(i){i.set('display', true)});    
  },
  fit_all: function() {
    // Fit all routes within the map.
    var max_ne = 0;
    var max_sw = 0;
    var bounds = null;
    this.layer.eachLayer(function(i){
      if (bounds==null) {bounds=i.getBounds()}
      bounds.extend(i.getBounds());
    });
    this.leaflet.fitBounds(bounds);
  }
});


