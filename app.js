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

// TODO: refactor the code, below
// TODO: use squel.js for writing queries

/**
 * @param number is a number.
 * @param callback is a function that accepts parameters, err and device, where
 *   err is an error, and device is an object that represents the newly created
 *   device.
 */
// TODO: test this function.
var insertNewDevice = function (number, callback) {
  var deviceNumber = connection.escape(number.toString());

  async.waterfall([
    function (callback) {
      connection.query(
        'Insert INTO devices (device_number) VALUES (' +
          deviceNumber +
        ');',
        function (err) {
          if (err) return callback(err);
          return callback(null);
        }
      );
    },

    function (callback) {
      connection.query(
        'SELECT id, device_number FROM devices ' +
          'WHERE device_number=' + deviceNumber + ';',

        function (err, results) {
          if (err) return callback(err);

          if (!results.length) {
            return callback(new Error('The new device has not'));
          }

          callback(null, results[0]);
        }
      );
    }
  ],
  function (err, device) {
    if (err) return callback(err);
    callback(null, device);
  });
};

/**
 * @param number is a number.
 */
// TODO: test this function.
var getDeviceFromNumber = function (number, callback) {
  var deviceNumber = connection.escape(number.toString());

  connection.query(
    'SELECT id, device_number FROM devices ' +
      'WHERE device_number=' + deviceNumber + ';',

    function (err, results) {
      if (err) return callback(err);

      if (!results.length) {
        return insertNewDevice(number, function (err, device) {
          if (err) return callback(err);
          callback(null, device);
        });
      }

      callback(null, results[0]);
    }
  );
};

var insertNewConsumptionData = function (id, kW, kWh, callback) {

};

setInterval(function () {
  request('http://' + settings.host + '/consumptions', function (err, res, body) {

    var consumptions;
    
    if (err) return console.error(err.message);
    
    try {
      consumptions = JSON.parse(body);

      consumptions.forEach(function (device) {
        async.waterfall([

          // Get the device's database ID, given its device number. If the
          // device isn't even in the database, then insert it.
          function (callback) {

            getDeviceFromNumber(device.deviceNumber, function (err, device) {
              if (err) return callback(err);
              callback(null, device);
            });

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