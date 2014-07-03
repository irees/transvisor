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

var Trip = Backbone.Model.extend({
  // Trip represents a set of trips that have the same stop sequence.
  // This is somewhat inverted from GTFS to simplify the GeoJSON.
  defaults: {
    display: true,
    los: 0
  }
});

var Route = Backbone.Collection.extend({
  // A Route is a set of related Trips, e.g. by headsign or route description.
  model: Trip
})

var AgencyCollection = Backbone.Collection.extend({
  // All  of the Trips for an Agency.
  url: 'data/test.geojson',
  model: Trip,
  parse: function(response) {
    return response.features;
  }
});

var RouteView = Backbone.View.extend({
  // View for a Route (and all of the Trip groups that belong to that Route).
  className: 'transvisor-route',
  template: _.template('<div><input type="checkbox" class="toggle" checked="checked" /><span><%- route_name %></span><button class="only transvisor-float-right transvisor-hover">Show</button></div><ul class="transvisor-routes"></ul>'),
  initialize: function(options) {
    this.route_name = options.route_name;
    this.collection = new AgencyCollection();
    this.listenTo(this.collection, 'add', this.add_route);
  },
  render: function() {
    this.$el.html(this.template(this));
    return this;
  },
  add_route: function(route) {
    var view = new TripView({model: route});
    this.$(".transvisor-routes").append(view.render().el);
  },
});

var TripView = Backbone.View.extend({
  // View for a set of Trips.
  tagName: "li",
  template: _.template('<span><%- properties.trip_headsign %></span><span class="transvisor-float-right">/ <%- properties.direction_id %></span>'),
  events: {
    "click .only"   : "only",
    "click .toggle"     : "toggle",
  },
  initialize: function() {
    this.listenTo(this.model, 'change:display', this.set_display);
  },
  render: function() {
    this.$el.html(this.template(this.model.attributes));
    return this;
  },
  // Model updates.
  set_display: function(e) {
    this.model.get('display') ? this.show() : this.hide();
  },
  // Update view.
  toggle: function(e) {
    this.model.set('display', !this.model.get('display'));
  },
  show: function(e) {
    this.$('.toggle').prop('checked', true);
  },
  hide: function(e) {
    this.$('.toggle').prop('checked', false);
  },
  only: function(e) {
    this.model.trigger('only', this);
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

var TransvisorApp = Backbone.View.extend({
  // App controller.
  initialize: function(options) {
    // RouteCollectionViews, keyed by route_short_name.
    this.routecollections = {};
    // The overall collection of all Route variants
    this.collection = new AgencyCollection();
    this.collection.url = options.url;
    this.leaflet = options.leaflet;
    this.layer = new L.LayerGroup().addTo(this.leaflet); 
    this.listenTo(this.collection, 'add', this.add_route);
    this.listenTo(this.collection, 'add', this.add_map);
    this.listenTo(this.collection, 'sync', this.fitall);
    this.listenTo(this.collection, 'only', this.only);
    this.collection.fetch();
  },
  add_route: function(trip) {
    // Add the Trip to the RouteView
    var route_name = trip.get('properties').route_short_name + ': ' + trip.get('properties').route_long_name;
    var view = this.routecollections[route_name];
    if (!view) {
      // Create the view if necessary.
      var view = new RouteView({route_name: route_name});
      this.routecollections[route_name] = view
      this.$el.append(view.render().el);
    }
    view.collection.add(trip)
  },
  add_map: function(trip) {
    // And also add a second View for the map layer.
    var view_map = new TripMapView({model: trip});
    this.layer.addLayer(view_map.render());
  },
  only: function(trip) {
    this.collection.each(function(i){i.set('display', false)});
    trip.model.set('display', true);
  },
  fitall: function() {
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


