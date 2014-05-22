var settings = require('./settings');
var request = require('request');
var influx = require('influx');
var async = require('async');
var mysql = require('mysql');
var _ = require('lodash');
var util = require('util');

var influxClient = influx(
  settings.get('influxdb:host'),
  settings.get('influxdb:port'),
  settings.get('influxdb:username'),
  settings.get('influxdb:password'),
  settings.get('influxdb:database')
);

var mysqlClient = mysql.createConnection({
  host: settings.get('mysql:host'),
  user: settings.get('mysql:username'),
  password: settings.get('mysql:password'),
  database: settings.get('mysql:database')
});

mysqlClient.connect();

console.log(
  'Polling the middleware',
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

  // Steps:
  //
  // 1. insert devices into the database, if they don't exist.
  // 2. insert the collected data into the database.
  async.waterfall([

    // Download data from the middleware.
    function (callback) {
      // Get all current values being read from mControl.
      request({
        // TODO: rename `remote:url_prefix` to `middleware:url_prefix`.
        url: settings.get('remote:url_prefix') + '/current',
      }, function (err, res, body) {
        // TODO: remove the repeated code:
        //
        //     setTimeout(function () {
        //       loop();
        //     }, looptimeout)

        // We should get a JSON body that looks like:
        //
        //   {
        //     energy_consumption: [ ... ],
        //     energy_draw: [ ... ],
        //     energy_production: [ ... ]
        //   }
        //
        // Possibly with some of the above aforementioned properties being
        // omitted. In those case, just interpret the missing property as an
        // empty array.
        try {
          var json = JSON.parse(body);
        } catch (e) {
          console.log(e);
          console.log('JSON:\n %s', body);
          return callback(err);
        }

        if (err) {
          // TODO: remove all instances of error messages sent to the screen.
          console.log(err.toString());
          callback(err);
        }
        callback(null, json);
      });
    },

    // Insert devices into the database, if they don't exist.
    function (json, callback) {
      // Extract the consumption value's device ID only.
      var devices = json.energy_consumption.map(function (consumption) {
        return consumption.id;
      });

      // The WHERE statement.
      //
      // It should generate a string that looks like
      //
      //     device_id = ? OR device_id = ? OR ... OR device_id = ?
      //
      // for N devices.
      var where = devices
        .map(function () {return 'device_id = ?'})
        .join(' OR ');

      var query = mysql.format(
        util.format(
          'SELECT * FROM energy_consumer_devices WHERE %s',
          where
        ), 
        devices
      );

      // Query the devices.
      mysqlClient.query(
        query,
        function (err, result) {
          if (err) { return callback(err); }
          // Extract the device's consumption value's device ID only.
          var databaseDevices = result.map(function (device) {
            return device.device_id;
          });
          var intersection = _.intersection(databaseDevices, devices);
          var toInsert = _.difference(devices, intersection);
          async.each(toInsert, function (deviceID, callback) {
            console.log('Good.');
            mysqlClient.query('INSERT INTO energy_consumer_devices (device_id) VALUES (?)', [deviceID], function (err, result) {
              if (err) { return callback(err); }
              callback(null);
            })
          }, function (err) {
            if (err) {callback(err);}
            callback(null, json);
          });
        }
      )
    },

    // Insert collected data into the database.
    function (json, callback) {
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
          influxClient.writePoints('energy_consumption', energyConsumption, function (err, result) {
            // TODO: check for any errors.
            callback(null);
          });
        },
        function (callback) {
          // This check avoids an additional roundtrip.
          if (!energyDraw.length) { return callback(null); }
          influxClient.writePoints('energy_draw', energyDraw, function (err, result) {
            // TODO: check for any errors.
            callback(null);
          });
        },
        function (callback) {
          // This check avoids an additional roundtrip.
          if (!energyProduction.length) { return callback(null); }
          influxClient.writePoints('energy_production', energyProduction, function (err, result) {
            // TODO: check for any errors.
            callback(null);
          });
        }
      ], function (error) {
        callback(null);
      });
    }
  ], function (err) {
    setTimeout(function () {
      loop();
    }, looptimeout);
  })
})();
