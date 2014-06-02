var settings = require('./settings');
var request = require('request');
var influx = require('influx');
var async = require('async');
var _ = require('lodash');
var util = require('util');

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
        url: settings.get('middleware:url_prefix') + '/current',
      }, function (err, res, body) {
        if (err) { return callback(err); }
        if (!res || res.statusCode >= 400) { return callback(new Error(body)); }
        // TODO: remove the repeated code:
        //
        //     setTimeout(function () {
        //       loop();
        //     }, looptimeout)

        // We should get a JSON body that looks like:
        //
        //   [
        //     {
        //       series: <string> 
        //       device_id: <string>
        //       value: <number>
        //       time: <ISO 8601 date string>
        //     }
        //   ]
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
        var currentTime = new Date().toISOString();

        json.filter(function (element) {
          if (element.series !== 'energy_consumption') {
            return true;
          }
          if (typeof cache[element.device_id] === 'undefined') {
            cache[element.device_id] = element.value;
            return false;
          }
          element.value = element.value - cache[element.devices_id];
          return true;
        });

        json.forEach(function (object) {
          object.time = currentTime;
        });

        callback(null, json);
      });
    },

    // Send the collected data to the database.
    function (json, callback) {
      request({
        url: settings.get('dbms:url_prefix') + '/data',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(json)
      }, function (err, res, body) {
        if (err) { return callback(err); }
        if (res && res.statusCode >= 400) {
          return callback(
            util.format(
              'Got POST response with status code %s:\n%s',
              res.statusCode,
              body
            )
          );
        }
        callback(null);
      })
    },
  ], function (err) {
    if (err) { console.log(err); }
    setTimeout(function () {
      loop();
    }, looptimeout);
  });
})();
