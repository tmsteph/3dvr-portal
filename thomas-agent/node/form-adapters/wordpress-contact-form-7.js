const generic = require('./generic-html-form');

module.exports = {
  id: 'wordpress-contact-form-7',
  canHandle({ html = '' } = {}) {
    return /contact-form-7|wpcf7|wpforms/i.test(html);
  },
  fill: generic.fill,
};
