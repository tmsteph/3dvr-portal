const generic = require('./generic-html-form');

module.exports = {
  id: 'wix-contact-form',
  canHandle({ html = '' } = {}) {
    return /wixform|wix-form|comp-\w*form|data-hook=["']form/i.test(html);
  },
  fill: generic.fill,
};
