const generic = require('./generic-html-form');

module.exports = {
  id: 'squarespace-form',
  canHandle({ html = '' } = {}) {
    return /squarespace|sqs-block-form|form-block|block-form/i.test(html);
  },
  fill: generic.fill,
};
