// GUN's Node server installs its yielding JSON parser globally. SEA later uses
// JSON.parseAsync to inspect every string value for signed metadata. That
// parser can throw synchronously on ordinary, non-JSON strings containing
// JSON punctuation, which can kill a queue worker. Replace the later dynamic
// lookup with native JSON.parse semantics: invalid JSON is delivered to the
// callback as an error instead of escaping the worker loop.
function installSafeGunJsonParser() {
  JSON.parseAsync = function safeGunParseAsync(text, done, reviver) {
    try {
      done(undefined, JSON.parse(text, reviver));
    } catch (error) {
      done(error);
    }
  };
}

module.exports = { installSafeGunJsonParser };
