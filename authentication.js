/**
 * This file manages the authentication with DataGraft
 * and Grafterizer.
 *
 * It uses a cookie session storage and OAuth2.
 * It should be used with an Expressjs server.
 */

'use strict';

// Simple-Oauth2 is a client library for OAuth2
const simpleOAuth2 = require('simple-oauth2');

// Simple OAuth2 uses underscore case
// jscs:disable requireCamelCaseOrUpperCaseIdentifiers

// Mozilla client sessions is a middleware
// storing encrypted sessino data in a cookie
const sessions = require('client-sessions');

// Import extend utility from default nodejs packages
const extend = require('util')._extend;

// Logging component for error and info messages
const logging = require('./logging');

// The callback URI is the address where DataGraft
// will redirect after having granted the access (or not)
const CALLBACK_URI = '/oauth/callback';

module.exports = (app, settings) => {

  // Setting up the OAuth2 client
  const oauth2Instance = simpleOAuth2({
    clientID: settings.oauth2ClientID,
    clientSecret: settings.oauth2ClientSecret,
    site: settings.oauth2Site
  });

  const hasDifferentPublicPath = settings.oauth2Site !== settings.publicOAuth2Site;

  // reanimeToken takes a token JSON object as input
  // and returns a SimpleOAuth2 Token object
  const reanimeToken = (token) => {
    let liveToken = oauth2Instance.accessToken.create(extend({}, token));

    // token.expires_at is broken by default
    // see https://github.com/lelylan/simple-oauth2/issues/59
    liveToken.token.expires_at = new Date(
      (parseInt(token.created_at) + parseInt(token.expires_in)) * 1000);
    return liveToken;
  };

  // Setting up the session middleware
  app.use(sessions({
    cookieName: 'oauthSession',
    secret: settings.cookieStoreSecret,
    duration: settings.sessionDuration,
    activeDuration: settings.sessionActiveDuration
  }));

  // The redirect URI is the URI which is accessed by the client
  // with the token, once the authorization is granted
  const redirect_uri = settings.publicCallbackServer + CALLBACK_URI;

  // Setting up the authorization uri
  var authorizationUri = oauth2Instance.authCode.authorizeURL({
    scope: settings.oauth2Scope,
    redirect_uri
  });

  // Fix the authorization URI if the oAuthSite URL needs to be
  // changed to be accessible by the client.
  if (hasDifferentPublicPath) {
    authorizationUri = settings.publicOAuth2Site +
      authorizationUri.slice(settings.oauth2Site.length);
  }

  const showError = (req, res, description, error) => {
    logging.error(description, {
      ip: req.ip,
      error
    });

    res.status(error && error.status ? error.status : 500);

    // res.render('error', {error: error});
    res.json(error);
  };

  // Display the status of the Authentification for the user
  // For debugging purpose or to proactively check the connection
  app.get('/oauth/status', (req, res) => {
    res.json({connected: !!(req.oauthSession && req.oauthSession.token)});
  });

  // Simple service that should redirect to the main page once
  // the user is correctly authentified
  app.get('/oauth/begin', (req, res) => {
    if (!req.oauthSession || !req.oauthSession.token) {
      var referrer = req.get('Referrer');
      if (referrer) {
        req.oauthSession.referrer = referrer;
      }

      return res.redirect(authorizationUri);
    }

    res.redirect(req.oauthSession.referrer || '/');
    delete req.oauthSession.referrer;
  });

  // Check if the user has a valid authentication token before
  // proceeding her request. The token is potentially renewed
  // This method is executed before each request
  app.use((req, res, next) => {
    // The callback uri is the only url that doesn't require an OAuth2 token
    // for obvious reasons
    if (req.path === CALLBACK_URI) return next();

    // If the session doesn't exist, or the session data doesn't contain a token,
    // Grafterizer redirect to the OAuth2 Grant page
    if (!req.oauthSession || !req.oauthSession.token) {
      // return res.redirect(authorizationUri);
      return res.status(401).send('Error 401: You are not authenticated.');
    }

    // Retrieve the token from the session store
    let token = reanimeToken(req.oauthSession.token);

    // If the token hasn't expired, we can immediately proceed
    // if (!token.expired() && Math.random() > 0.5) return next();
    if (!token.expired()) return next();

    logging.info('Refreshing the token', {
      ip: req.ip
    });

    // Refreshing the token
    token.refresh((error, result) => {
      // If an error has occured
      if (error) {
        // If it's an authentication error
        if (error.status === 403 || error.status === 401) {
          // it's better to start again from scratch
          delete req.oauthSession.token;
          return res.redirect(authorizationUri);
        }

        // When something strange happens
        delete req.oauthSession.token;
        return showError(req, res, 'Unable to refresh the OAuth2 token');
      }

      // If the token has correctly been refreshed,
      // it's time to save it in the session store
      req.oauthSession.token = result.token;

      // And proceed to the request
      next();
    });
  });

  // Check and parse the token and save in the session, before redirecting to the
  // following page
  app.get(CALLBACK_URI, (req, res) => {

    // If the user refused to grant the access
    if (req.query.error) {
      return showError(req, res, {
        status: 401,
        message: req.query.error,
        description: req.query.error_description
      });
    }

    // If the request is invalid
    if (!req.query.code) {
      return showError(req, res, 'The OAuth2 code parameter is missing', {
        status: 400,
        message: 'Bad Request'
      });
    }

    logging.info('Checking and validating the token', {
      ip: req.ip
    });

    // Check and parse the token
    oauth2Instance.authCode.getToken({
      code: req.query.code,
      redirect_uri
    }, (error, result) => {
      // If the error occur when checking the token
      if (error) {
        // The token might be broken, it's better
        // to remove it
        delete req.oauthSession.token;

        // The error may contain a context with more
        // information
        if (error.context) {
          return showError(req, res, 'Error while checking the token', {
            status: error.status,
            message: error.context.error,
            description: error.context.error_description
          });
        } else {
          return showError(req, res, 'Error while checking the token', {
            status: error.status,
            message: error.message,
          });
        }
      }

      // Saving the token
      req.oauthSession.token = result;

      // Redirect to the main page or the referrer
      res.redirect(req.oauthSession.referrer || '/');
      delete req.oauthSession.referrer;
    });
  });
};

// jscs:enable requireCamelCaseOrUpperCaseIdentifiers
