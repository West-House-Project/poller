/* globals describe, it */

'use strict';

var expect = require('expect.js');
var utils = require('./lib/utils');

describe('utils', function () {
  describe('areHoursSame', function () {
    it('should return false even if there is a minute difference between ' +
      'one hour, and another', function () {

      var hour1 = new Date('01-01-01 00:59:59');
      var hour2 = new Date('01-01-01 01:00:00');

      var areSame = utils.areHoursSame(hour1, hour2);

      expect(areSame).to.be(false);
    });

    it('should return true when two different times represent the same hour',
      function () {

      var hour1 = new Date('01-01-01 00:00:00');
      var hour2 = new Date('01-01-01 00:00:59');

      var areSame = utils.areHoursSame(hour1, hour2);

      expect(areSame).to.be(true);
    });

    it('should return false, where, inspite of having the same hours, the ' +
      'calendar days don\'t match', function () {

      var hour1 = expect('01-01-01 00:00:00');
      var hour2 = expect('01-01-02 00:00:00');

      var areSame = utils.areHoursSame(hour1, hour2);

      expect(areSame).to.be(false);
    });
  });
});
