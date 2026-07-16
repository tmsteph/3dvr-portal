const wordpressContactForm7 = require('./wordpress-contact-form-7');
const wixContactForm = require('./wix-contact-form');
const squarespaceForm = require('./squarespace-form');
const genericHtmlForm = require('./generic-html-form');

const ADAPTERS = [
  wordpressContactForm7,
  wixContactForm,
  squarespaceForm,
  genericHtmlForm,
];

function selectAdapter(context = {}) {
  return ADAPTERS.find((adapter) => adapter.canHandle(context)) || null;
}

module.exports = {
  ADAPTERS,
  genericHtmlForm,
  selectAdapter,
  squarespaceForm,
  wixContactForm,
  wordpressContactForm7,
};
