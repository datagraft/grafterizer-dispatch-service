/**
 * Grafterizer-reborn is a server component.
 * It handle request authentication for Grafterizer and dispatch requests
 * input and output across the multiple services.
 */

'use strict';

// Express is a HTTP server library.
const express = require('express');

// This component allows compression of HTTP response,
// it has some CPU cost but most of the transmitted data can
// be very well compressed.
const compression = require('compression');

// Morgan is an HTTP logging component.
const morgan = require('morgan');

// HTTP CORS library, to allow other applications domains
// to contact this service. For example http://localhost:9000 can use
// this service on https://grafterizer.datagraft.net
const cors = require('cors');

// serve-favicon is a middleware dedicated and optimized for /favicon.ico requests
const favicon = require('serve-favicon');

// Logging component for error and info messages
const logging = require('./logging');


/**
 * All the following settings are pre-configured, but can be overrided using environnement
 * variables.
 *
 * Example:
 *  export HTTP_PORT=8085
 */

// This is the TCP port where this component is listening
const serverPort = process.env.HTTP_PORT || 8082;

// CORS can be disabled to improve security, meaning only the grafterizer client
// from the same server can access to this service
const disableCors = !!process.env.DISABLE_CORS;

// How long the client session should stay valid in ms, 2 hours by default
const sessionDuration = parseInt(process.env.SESSION_DURATION) || 2 * 60 * 60 * 1000;

// if expiresIn < activeDuration, the session will be extended by activeDuration milliseconds
const sessionActiveDuration = parseInt(process.env.SESSION_ACTIVE_DURATION) || 60 * 5 * 1000;

// The OAuth2 callback server URI, that should be publicly accessible by the Grafterizer web client
const publicCallbackServer = process.env.PUBLIC_CALLBACK_SERVER || 'http://localhost:' + serverPort + '';

// The OAuth2 access scope for Grafterizer
const oauth2Scope = process.env.OAUTH_SCOPE || 'public';

// Trust the nTh hop from the front-facing proxy server as the client
const trustProxyNumber = parseInt(process.env.TRUST_PROXY_NUMBER) || 0;

/**
 * The following settings are required and the service will not start
 * if they are missing.
 */

// CORS origin is the domain that are allowed by CORS.
// localhost and grafterizer.datagraft.net are allowed by default
// It must not be *
if (!process.env.CORS_ORIGIN) console.error('CORS_ORIGIN must not be empty') & process.exit(1);
const corsOrigin = (process.env.CORS_ORIGIN || '').split(',');

// The cookie store secret is used to generate private keys for the cookie session store.
// It should be a large unguessable string
const cookieStoreSecret = process.env.COOKIE_STORE_SECRET;
if (!cookieStoreSecret) console.error('COOKIE_STORE_SECRET must be defined') & process.exit(1);

// Required registered OAauth2 client ID
const oauth2ClientID = process.env.OAUTH2_CLIENT_ID;
if (!oauth2ClientID) console.error('OAUTH2_CLIENT_ID must be defined') & process.exit(1);

// Required registered OAuth2 server site
const oauth2ClientSecret = process.env.OAUTH2_CLIENT_SECRET;
if (!oauth2ClientSecret) console.error('OAUTH2_CLIENT_SECRET must be defined') & process.exit(1);

// Required datagraft server address
const datagraftUri = process.env.DATAGRAFT_URI;
if (!datagraftUri) console.error('DATAGRAFT_URI must be defined') & process.exit(1);

// Graftwerk HTTP endpoint URI
// This endpoint could be the Graftwerk loadbalancer
const graftwerkUri = process.env.GRAFTWERK_URI;
if (!graftwerkUri) console.error('GRAFTWERK_URI must be defined') & process.exit(1);

// The Graftwerk cache component is a cache allowing to serve requests faster
// when they have been already executed
// It is not embedded in this server as this is stateless while the cache is not
// Please not that the cache is also a Single Point of Failure in its current version
const graftwerkCacheUri = process.env.GRAFTWERK_CACHE_URI;
if (!graftwerkCacheUri) console.error('GRAFTWERK_CACHE_URI must be defined') & process.exit(1);

// OAuth2 authentication server site, default to datagraftUri
const oauth2Site = process.env.OAUTH2_SITE || datagraftUri;

// The public path of the portal, that should be publicly accessible by the Grafterizer web client
// You should define it in case OAUTH2_SITE is an internal URI.
const publicOAuth2Site = process.env.PUBLIC_OAUTH2_SITE || oauth2Site;

// Setting up the express HTTP server
const app = express();

// Enabling compression of HTTP output
app.use(compression());

// Enable HTTP logging on the standard output, using Apache syntax
app.use(morgan('short'));

// Enable CORS request if necessary
if (!disableCors) app.use(cors({
  // Credentials is required to use the cookie session storage
  credentials: true,

  // When credentials is enabled, corsOrigin should be defined
  // and not be *
  origin: corsOrigin
}));

// Configure Express to trust the proxy for nTh clients
// It is used to get the IP address from the proxy,
// using the X-Forwarded-* headers
if (trustProxyNumber) app.set('trust proxy', trustProxyNumber);

// Serve a favicon to remove 404 errors from the log, and eventually
// have a beautiful favicon in the browser history
app.use(favicon(__dirname + '/favicon.ico'));

// Loading the authentication middleware
require('./authentication')(app, {
  oauth2ClientID,
  oauth2ClientSecret,
  oauth2Site,
  sessionDuration,
  sessionActiveDuration,
  cookieStoreSecret,
  publicCallbackServer,
  publicOAuth2Site
});

// Simple status page
app.get('/', (req, res) => {
  res.send('ok');
});

// Grafterizer transformation computing
require('./computing')(app, {
  datagraftUri,
  graftwerkUri,
  graftwerkCacheUri
});

// All the remaining requests are proxied to DataGraft,
// to use the DataGraft API while being authenticated
require('./datagraftProxy')(app, {
  datagraftUri
});

// At least one dependency throws errors that could be ignored
// But by default it's better to crash
if (process.env.IGNORE_UNCAUCH_EXCEPTIONS) {
  process.on('uncaughtException', function(err) {
    logging.error(err);
  });
}

// Starting the HTTP server
app.listen(serverPort, () => {
  logging.info('Grafterizer-reborn started on http://localhost:' + serverPort + '/');
});
