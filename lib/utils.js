'use strict';

module.exports.areHoursSame = function (hour1, hour2) {
  // Note: the `Date` in `hour1Date` and `hour2Date` represents calendar days
  //   and not the JavaScript date object.
  var hour1Date = new Date(hour1).setHours(0, 0, 0, 0);
  var hour2Date = new Date(hour2).setHours(0, 0, 0, 0);

  if (hour1Date !== hour2Date) {
    return false;
  }

  return hour1.getHours() === hour2.getHours();
};
