var Route = Backbone.Model.extend({
  // A single Route.
  defaults: {
    display: true,
    los: 0
  }
});

var RouteCollection = Backbone.Collection.extend({
  // Collection of Routes.
  url: 'data/actransit.geojson',
  model: Route,
  parse: function(response) {
    return response.features;
  }
});

var RouteView = Backbone.View.extend({
  // Route list view.
  tagName: "li",
  template: _.template('<input type="checkbox" class="toggle" checked="checked" /><span><%- properties.route_headsign %></span><button class="only">Show</button>'),
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
    this.model.trigger('only');
  }
});

var RouteMapView = Backbone.View.extend({
  // Map view.
  initialize: function() {
    this.listenTo(this.model, 'change:display', this.set_display);
    // Use the model's ID as the Leaflet layer class suffix.
    this.gclass = 'cityism-transvisor-route-' + this.model.cid;
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
  // Overall app View.
  initialize: function(options) {
    this.leaflet = options.leaflet;
    this.layer = new L.LayerGroup().addTo(this.leaflet); 
    this.listenTo(Routes, 'add', this.addOne);
    this.listenTo(Routes, 'sync', this.fitall);
    this.listenTo(Routes, 'only', this.only);
    Routes.fetch();
  },
  addOne: function(route) {
    // Add a Route to the view.
    var view = new RouteView({model: route});
    this.$("#cityism-transvisor-routes").append(view.render().el);
    // And also add a second View for the map layer.
    var view_map = new RouteMapView({model: route});
    this.layer.addLayer(view_map.render());
  },  
  only: function(e) {
    Routes.each(function(i){i.set('display', false)});
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


