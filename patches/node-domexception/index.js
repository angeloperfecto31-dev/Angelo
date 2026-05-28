// Native DOMException resolver patch to bypass the deprecated node-domexception package.
module.exports = globalThis.DOMException;
