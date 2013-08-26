/* jshint node: true */

'use strict';

var request    = require('request'),
    settings   = require('./settings.json'),
    mysql      = require('mysql'),
    async      = require('async'),
    connection = mysql.createConnection({
      host    : 'localhost',
      user    : settings.database.user,
      password: settings.database.password,
      database: settings.database.database
    }),
    INTERVAL   = 10 * 1000; // 10 seconds

connection.connect();

// TODO: refactor the code, below.
// TODO: use squel.js for writing queries.

setInterval(function () {
  request('http://' + settings.host + '/consumptions', function (err, res, body) {

    var consumptions;
    
    if (err) return console.error(err.message);
    
    try {
      consumptions = JSON.parse(body);

      consumptions.forEach(function (device) {
        var deviceNumber = connection.escape(device.deviceNumber);

        async.waterfall([

          // Get the device's database ID, given its device number. If the
          // device isn't even in the database, then insert it.
          function (callback) {

            // Looks for the device.
            connection.query(
              'SELECT id, device_number FROM devices ' +
                'WHERE device_number=' + deviceNumber + ';',

              function (err, results) {
                if (err) return callback(err);

                if (!results.length) {

                  // This code is reached, because there were no devices'
                  // metadata in the database that matched the device's
                  // number.

                  // TODO: so far, the code queries for a device via the 
                  //   device number (which is different from the primary
                  //   key). And then, if it isn't able to find any devices,
                  //   it will insert the new device. Now, it is required to
                  //   query for the device, anew. It will be ideal if this
                  //   wasn't the case.
                  return async.waterfall([

                    // New device insertion.
                    function (callback) {
                      connection.query(
                        'INSERT INTO devices (device_number) VALUES (' +
                          deviceNumber +
                        ');',
                        function (err) {
                          if (err) return callback(err);
                          return callback(null);
                        }
                      );
                    },

                    // Get the newly inserted device.
                    function (callback) {
                      connection.query(

                        'SELECT id, device_number FROM devices ' +
                          'WHERE device_number=' + deviceNumber + ';',

                        function (err, results) {
                          if (err) return callback(err);

                          if (!results.length) {

                            // In theory, there should be a device with the
                            // stored device number.
                            return callback(new Error(
                              'The new device has not been entered.'
                            ));

                          }

                          return callback(results[0]);
                        }
                      );
                    }

                  ],

                  function (err, result) {
                    if (err) return callback(err);

                    callback(null, result);
                  });
                }

                // If there weren't any devices given the device ID, then the
                // code below is unreacheable.

                process.nextTick(function () {
                  callback(null, results[0]);
                });

              }
            );

          },

          // Insert the energy consumption data.
          function (result, callback) {
            connection.query(
              'INSERT INTO energy_consumption (device_id, kw, kwh) VALUES (' +
                connection.escape(result.id) + ',' +
                connection.escape(device.kW) + ',' +
                connection.escape(device.kWh) +
              ');',
              function (err) {
                if (err) return callback(err);
                callback(null);
              }
            );
          }
        ],
        function (err) {
          if (err) return console.error(err);
        });
      });
    } catch (e) {
      return console.error(e.message);
    }
  });
}, INTERVAL);

console.log('Polling the West House Middleware');