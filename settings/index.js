var nconf = require('nconf');
var path = require('path');

nconf.use('memory');

nconf.env();

nconf.set('environment', nconf.get('NODE_ENV') || 'production');

nconf.file({
  file: path.join(__dirname, nconf.get('environment') + '.json')
});

module.exports.get = function (key) {
  return nconf.get(key);
}