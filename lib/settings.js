var settings = require('../settings.json');

module.exports = settings.dev;

if (process.env.NODE_ENV === 'production') {
  module.exports = settings.prod;
}
