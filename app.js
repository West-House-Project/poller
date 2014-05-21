var settings = require('./settings');
var request = require('request');
var influx = require('influx');
var async = require('async');

var client = influx(
  settings.get('influxdb:host'),
  settings.get('influxdb:port'),
  settings.get('influxdb:username'),
  settings.get('influxdb:password'),
  settings.get('influxdb:database')
);

console.log(
  'Polling database %s, on host %s, on port %s, with username %s',
  settings.get('influxdb:database'),
  settings.get('influxdb:host'),
  settings.get('influxdb:port'),
  settings.get('influxdb:username')
);

// Unlike the name implies, this isn't used to store the data temporarily in
// order for faster retrieval the next time. Instead, this is for holding the
// previous kWh value.
var cache = {};

const looptimeout = 1000;

// This will infinite loop.
(function loop() {
  // Get all current values being read from mControl.
  request({
    // TODO: rename `remote:url_prefix` to `middleware:url_prefix`.
    url: settings.get('remote:url_prefix') + '/current',
  }, function (err, res, body) {
    if (err) {
      console.log(err.toString());
      return setTimeout(function () {
        loop();
      }, looptimeout);
    }
    // TODO: check for any errors.

    // TODO: insert the energy consumer data into MySQL.

    // We should get JSON body that looks like:
    //   {
    //     energy_consumption: [ ... ],
    //     energy_draw: [ ... ],
    //     energy_production: [ ... ]
    //   }
    //
    // Possibly with some of the above aforementioned properties being omitted.
    // In those case, just interpret the missing property as an empty array.
    try {
      var json = JSON.parse(body);
    } catch (e) {
      console.log(e);
      console.log('JSON:\n %s', body);
      return setTimeout(function () {
        loop();
      }, looptimeout);
    }

    // The current time.
    var time = new Date();

    // Now get the three properties.

    // Cache the energy consumption data, so that we don't get the running
    // total.
    var energyConsumption = (json.energy_consumption && json.energy_consumption.map(function (point) {
        var previous = cache[point.id];
        cache[point.id] = {
          id: point.id,
          value: point.value
        };
        if (previous) {
          // The new value is now the old value.
          cache[point.id].previousKWh = previous.value;
        } else {
          // The device never existed, and therefore, we will simply assume that
          // there was no such thing as the device in the database.
          cache[point.id].previousKWh = 0;
        }
  
        return {
          id: point.id,
          value: cache[point.id].value - cache[point.id].previousKWh,
          time: time
        }
      })) || [];
    var energyDraw = json.energy_draw || [];
    var energyProduction = json.energy_production || [];

    // Insert the data parallely (if that's even a word).
    async.parallel([
      function (callback) {
        // This check avoids an additional roundtrip.
        if (!energyConsumption.length) { return callback(null); }
        client.writePoints('energy_consumption', energyConsumption, function (err, result) {
          // TODO: check for any errors.
          callback(null);
        });
      },
      function (callback) {
        // This check avoids an additional roundtrip.
        if (!energyDraw.length) { return callback(null); }
        client.writePoints('energy_draw', energyDraw, function (err, result) {
          // TODO: check for any errors.
          callback(null);
        });
      },
      function (callback) {
        // This check avoids an additional roundtrip.
        if (!energyProduction.length) { return callback(null); }
        client.writePoints('energy_production', energyProduction, function (err, result) {
          // TODO: check for any errors.
          callback(null);
        });
      }
    ], function (error) {
      setTimeout(function () {
        loop();
      }, looptimeout);
    });

  }); // End of request call
})();
