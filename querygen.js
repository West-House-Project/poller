//Query Generator for the west-house-project
//These will automatically generate a query based on the parameters passed

"use strict";

function SetTimeFrame(query, startDateTime, endDateTime){
  //takes a generated query statement and appends it to only seach for entries
  //with a polltime between the specified datetime parameters
  if (query[query.length - 1] === ";") {
    query = query.substr(0, query.length-1);
    //trimming the semicolon off the end before appending the statement
  }
  
  if(query.contains("GROUP BY") === true){
    var queryEnd = query.substr(query.indexof("GROUP BY"), query.length - query.indexof("GROUP BY"));
    query = query.substr(0, query.indexof("GROUP BY"));
    query += " AND polltime < " + startDateTime;
    query += " AND polltime > " + endDateTime + queryEnd + ";";
  } else {
    query += " AND polltime < " + startDateTime;
    query += " AND polltime > " + endDateTime + ";";
  }
  return query;
}

function HoursByDay(starthour, numhours, dayofweek, id){
//starthour is expected to be an integer (0->23)
//numhours is expected to be an integer(0->23)determining the number of hours to return
//no entries will fall outside the day specified
//con_hours is queried
  
  var retQuery = "SELECT * FROM con_hours";
  retQuery += " WHERE ind = " + id;
  retQuery += " AND HOUR(polltime) > " + starthour;
  retQuery += " AND HOUR(polltime) < DATE_ADD(polltime, INTERVAL " + numhours + " HOUR)  AND dayofweek(polltime) = " +dayofweek +";";
  return retQuery;
}

function HoursByDay(starthour, numhours, id){
  //starthour is expected to be an integer (0->23)
  //numhours is expected to be an integer(0->23)determining the number of hours to return
  //no entries will fall outside the day specified
  //functionally the same as the above function this polymorphs
  var retQuery = "SELECT * FROM con_hours";
  retQuery += " WHERE ind = " + id;
  retQuery +=  " AND HOUR(polltime) > " + starthour;
  retQuery += " AND HOUR(polltime) < DATE_ADD(polltime, INTERVAL " + numhours + " HOUR)";
  return retQuery;

}

function QueryPerInterval(interval, id){
  //id is expected to be a number
  //this returns the data in blocks of <interval> minutes at a time. Intervals will always begin on the hour.
  var retQuery = "SELECT DATE_SUB(DATE_SUB(polltime, INTERVAL MOD(MINUTE(polltime), " + interval;
  retQuery += ") MINUTE), INTERVAL SECOND(polltime) SECOND)";
  retQuery += " AS min_rnd, ind, units, avg(value), avg(frequency) FROM consumption WHERE ind = " + id;
  retQuery += " GROUP BY min_rnd, ind, units;";
  return retQuery;
}
