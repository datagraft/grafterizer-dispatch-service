/**
 * Instead of parsing request, requesting datagraft, parsing the returned data
 * and returning the data, we use a proxy approach. We just forward the request
 * with the correct authentication and some access control.
 *
 * It's faster and simpler.
 */

'use strict';

// jscs:disable requireCamelCaseOrUpperCaseIdentifiers

// Logging component for error and info messages
const logging = require('./logging');

// http-proxy is the component used to create the reverse proxy
const httpProxy = require('http-proxy');

// AgentKeepAlive adds support of keepalive HTTP connections for http-proxy
const AgentKeepAlive = require('agentkeepalive');

// The following settings are related to the keepAlive options,
// the default values are good enough for most of the use cases

// Sets the working socket to timeout after milliseconds of inactivity
const proxyTimeout = parseInt(process.env.PROXY_TIMEOUT) || 10 * 1000;

// Sets the free socket to timeout after milliseconds of inactivity
const keepAliveTimeout = parseInt(process.env.KEEP_ALIVE_TIMEOUT) || 10 * 1000;

// Maximum number of sockets to allow per host
const maxSockets = parseInt(process.env.KEEP_ALIVE_MAX_SOCKETS) || 10;

// Maximum number of sockets to leave open in a free state
const maxFreeSockets = parseInt(process.env.KEEP_ALIVE_MAX_FREE_SOCKETS) || 3;

const matchPublicAssetUriPattern = new RegExp("(^\/[^\/]+\/(utility_functions|queriable_data_stores|transformations|data_distributions|sparql_endpoints|filestores)\/?.+)\/readonly");

// Creating a proxy with the keep alive agent
const newProxy = function newProxy() {
  let proxy = httpProxy.createProxyServer({
    agent: new AgentKeepAlive({
      maxSockets,
      maxFreeSockets,
      keepAliveTimeout,
      timeout: proxyTimeout
    })
  });

  // Configure the proxied request
  proxy.on('proxyReq', function (proxyReq, req, res, options) {
    // We only use the JSON API
    proxyReq.setHeader('Accept', 'application/json');
    var publicAssetRequest = matchPublicAssetUriPattern.test(req.path);

    if (!publicAssetRequest) {
      try {
        proxyReq.setHeader('Authorization', 'Bearer ' + req.oauthSession.token.access_token);
      } catch (e) {
        logging.error('Unable to get the authorization token from the session cookie store', {
          message: e.message
        });
        res.status(500).json({
          error: e
        });
      }
    } else {
      try {
        proxyReq.setHeader('Authorization', 'Bearer ' + req.oauthSession.token.access_token);
      } catch (e) {
        logging.error('Loading read-only asset. Unable to get the authorization token from the session cookie store. Trying to retrieve as public asset.', {
          message: e.message
        });
      }
      var requestPath = req.path.match(matchPublicAssetUriPattern);

    }
  });

  proxy.on('error', function (error, req, res) {
    // In case of an error, we try to reset the proxy
    // it might leaks memory but it might also prevents
    // a few problems, this has to be check before 2019
    proxy = newProxy();

    // Logs the proxy errors
    logging.error('Proxy error', {
      message: error.message
    });

    if (!res.headersSent) {
      res.status(500);
    }

    res.json({
      error: 'proxy error',
      message: error.message
    });

  });

  proxy.on('proxyRes', function (proxyRes, req, res) {
    // Delete these headers as they cause CORS errors
    delete proxyRes.headers['access-control-allow-credentials'];
    delete proxyRes.headers['access-control-allow-origin'];
  });

  return proxy;
};

// Initialing a proxy
var proxy = newProxy();



// Forward requests that match only this pattern
const matchUriPattern = /^\/[^\/]+\/(utility_functions|queriable_data_stores|transformations|data_distributions|sparql_endpoints|filestores)\/?/;


module.exports = (app, settings) => {
  app.use((req, res, next) => {

    // Skip the requests that are not related to the bridged DataGraft API
    if (!matchUriPattern.test(req.path)) return next();

    // Forward the incoming request to DataGraft
    proxy.web(req, res, {
      target: settings.datagraftUri
    });

  });
};