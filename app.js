/* jshint node: true */

'use strict';

var INTERVAL   = 10 * 1000;

var utils = require('./lib/utils');
var request = require('request');
var mysql = require('mysql');
var async = require('async');

var settings = require('./lib/settings.js');

var connection = mysql.createConnection({
  host    : 'localhost',
  user    : settings.database.user,
  password: settings.database.password,
  database: settings.database.database
});

var remoteURL =
  'http://' + settings.host + ':' + settings.port + '/consumptions';

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

        console.log('New device found: ' + number);

        return insertNewDevice(number, function (err, device) {
          if (err) return callback(err);
          callback(null, device);
        });
      }

      callback(null, results[0]);
    }
  );
};

/**
 * @param the device's database ID, for the consumption data to refer to.
 */
var insertConsumptionData = function (id, kW, kWh, callback) {
  connection.query(
    'INSERT INTO energy_consumption (device_id, kw, kwh) VALUES (' +
      connection.escape(id) + ', ' +
      connection.escape(kW) + ', ' +
      connection.escape(kWh) +
    ');',
    function (err) {
      if (err) return callback(err);
      callback(null);
    }
  );
};

/**
 * So there are hourly totals in the `hourly_totals` table. It has a
 * `start_kwh` and a `hour_kwh` column. The `start_kwh` column represents the
 * kWh reading at the start of the hour, and `hour_kwh` is the cumulated kWh
 * within that hour. In other words, `hour_kwh = kWh - start_kwh`.
 *
 * @param deviceId represents the foreign key to a record in the `devices`
 *   table in the database.
 * @param kWh is the current killowatt hour of a particular device.
 * @param callback is a function that is called once data has gone into the
 *   database.
 */
var insertHourlyTotal = function (deviceId, kWh, callback) {
  connection.query(
    'SELECT device_id, time, start_kwh, hour_kwh ' +
    'FROM hourly_totals ' +
    'WHERE device_id=' + connection.escape(deviceId) + ' ' +
    'ORDER BY time DESC ' +
    'LIMIT 1;',

    function (err, results) {
      var currentTime = new Date();
      var result = results[0];

      var queryDone = function (err) {
        if (err) return callback(err);
        callback(null);
      };

      if (
        !results.length ||
        !utils.areHoursSame(result.time, currentTime)
      ) {
        var query =
          'INSERT INTO hourly_totals ' +
          '(device_id, time, start_kwh, hour_kwh) ' +
          'VALUE ( ' +
            connection.escape(deviceId) + ', ' +
            connection.escape( currentTime ) + ', ' +
            connection.escape(kWh) + ', ' +
            connection.escape(0) + ' ' +
          ');';
        return connection.query(query, queryDone);
      }

      console.log('device id         : ' + deviceId);
      console.log('Current kWh       : ' + kWh);
      console.log('Start kWh         : ' + result.start_kwh);
      console.log('Is start > current: ' + (result.start_kwh > kWh));
      console.log('Hourly total      : ' + (kWh - result.start_kwh));
      console.log();

      connection.query(
        'UPDATE hourly_totals ' +
        'SET hour_kwh=' + connection.escape( kWh - result.start_kwh ) + ' ' +
        'WHERE device_id=' + connection.escape(deviceId) +
        ';',
        queryDone
      );
    }
  );
};

setInterval(function () {
  request(remoteURL, function (err, res, body) {
    if (err) return console.error(err.message);
    
    try {
      var consumptions = JSON.parse(body);

      consumptions.forEach(function (device) {

        // TODO: rewrite this function so that the `result` value, below, is
        //   not required to be propagated at more than one callback.
        async.waterfall([

          // Get the device's database record, given its device number. If the
          // device isn't in the database, then insert it.
          function (callback) {

            getDeviceFromNumber(device.deviceNumber, function (err, device) {
              if (err) return callback(err);
              callback(null, device);
            });

          },

          // Insert the energy consumption data.
          function (result, callback) {
            insertConsumptionData(
              result.id, device.kW, device.kWh,
              function (err) {
                if (err) return callback(err);
                callback(null, result);
              }
            );
          },

          // Insert the hourly total.
          function (result, callback) {
            insertHourlyTotal(
              result.id, device.kWh,
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
console.log('URL: ' + remoteURL);
