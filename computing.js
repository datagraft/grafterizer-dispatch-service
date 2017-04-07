/**
 * Computing component.
 *
 * Or the glue between Grafterizer, Graftwerk and DataGraft.
 */


'use strict';

// jscs:disable requireCamelCaseOrUpperCaseIdentifiers

// Logging component for error and info messages
const logging = require('./logging');

// Request is a library to easely create HTTP requests
const request = require('request');

// BodyParser is used to parse JSON in the body of HTTP requests
const bodyParser = require('body-parser');

// Path is used to extract information from a file path
const path = require('path');

// Mime is used to get the mimetype from a file extension
const mime = require('mime');

// Parse content-disposition headers
const contentDisposition = require('content-disposition');

// Transform a stream to a string
const concat = require('concat-stream');

// Manipulate files in nodejs
const fs = require('fs');

// System constants to manipulate files
const constants = require('constants');

// Manage temporary files paths
const temp = require('temp');

// Initializing the jsonParser
const jsonParser = bodyParser.json();

// The .nt mimefile is not defined by default
mime.define({
  'application/n-triples': ['nt'],
  'text/turtle': ['ttl'],
  'application/rdf+xml': ['rdf'],
  'application/n-quads': ['nq'],
  'text/n3': ['n3'],
  'application/trix': ['trix'],
  'application/trig': ['trig'],
  'application/ld+json': ['jsonld']
});

// Return the authorization token from the request
// The authorazation token must exist and is probably already
// checked by the authentication middleware
const getAuthorization = (req) => {
  try {
    return 'Bearer ' + req.oauthSession.token.access_token;
  } catch (e) {
    logging.error('Unable to get the authorization token from the session cookie store');
  }
};

// Returns information about the file, using the content-disposition header
// Also returns default values as a failback (in CSV)
const getAttachmentInfos = (response) => {
  const defaultInfos = {
    type: 'csv',
    name: 'output',
    filename: 'output.csv',
    mime: 'text/csv'
  };

  // If no headers are present or no content-disposition, the default informations
  // are returned
  if (!response.headers || !response.headers['content-disposition']) {
    return defaultInfos;
  }

  // Parse the content disposition header, fallback to the default informations
  // if it fails
  let disposition;
  try {
    disposition = contentDisposition.parse(response.headers['content-disposition']);
  } catch (e) {
    return defaultInfos;
  }

  // If the filename is not present int he content-disposition header,
  // returns the default information
  if (!disposition.parameters || !disposition.parameters.filename) {
    return defaultInfos;
  }

  // Compute the required informations from the parsed content-disposition header
  const filename = disposition.parameters.filename;
  const ext = path.extname(filename);

  return {
    type: ext.slice(1),
    name: path.basename(filename, ext),
    filename: path.basename(filename),
    mime: mime.lookup(ext)
  };
};

const downloadErrorText = '<h3>An error has occured.</h3>' + '<p><code></pre>{{OUTPUT}}</pre></code></p>' +
  '<p><a href="http://project.dapaas.eu/dapaas-contact-us">Please contact us.</a></p>';

module.exports = (app, settings) => {

  // Returns and display an error
  const showAndLogError = (res, status, message, data) => {
    // If the headers are already sent, it probably means the server has started to
    // provide a message and it's better to just keep the same message instead of
    // crashing trying to send already sent headers
    if (!res.headersSent) {
      res.status(status).json({
        error: message,
        data
      });
    }

    logging.error(message, data);
  };

  // This regular expression is used to extract the ID
  // from an upwizards distribution ID
  const upwizardExtractIDRegex = /^upwizards--(\d+)$/;

  // Return a request to download the raw distribution
  // The stream can be transmitted directly to the client
  // or forwarded to Grafterizer
  const downloadRaw = (req, res) => {

    // Loading the distribution id parameter
    // from the query paramaters or the post body
    const distribution = req.params.distribution || req.query.distribution || (req.body && req.body.distribution);

    // If somehow the distribution ID is not provided,
    // it's better to stop here
    if (!distribution) {
      showAndLogError(res, 400, 'The distribution ID is missing');
      return;
    }

    // There is different kinds of files in Datagraft
    // filestores files, and upwizards files.
    // upwizards files are identified by a number
    // if the distribution ID starts with upwizards--, 
    // it means it's an upwizards file. Otherwise, it's a filestores file
    // It should not be possible to create a filestores file with an ID starting
    // with upwizards--
    const matchUpwizardId = distribution.match(upwizardExtractIDRegex);

    // DataGraft query asking the attached file
    return request.get({
      // /attachement DataGraft's method redirects to the URL of the attachment
      url: settings.datagraftUri + '/myassets/' + (matchUpwizardId ? 'upwizards' : 'filestores') + '/' +
        encodeURIComponent(matchUpwizardId ? matchUpwizardId[1] : distribution) + '/attachment',
      headers: {
        // You need a valid authorization of course
        Authorization: getAuthorization(req)
      }
    }).on('error', function(err) {
      showAndLogError(res, 500, 'Unable to download the data distribution', err);
    });
  };

  // Execute the transformation using Graftwerk
  // The important thing to notice is that the filestores is
  // directly transferred from DataGraft to Graftwerk
  // This server never has the whole file in memory. It is only
  // working on streams and buffers. The advantage is that it requires
  // less memory, and it is faster as the file transfers are reduced.
  // The cons are a sligthly more complex codebase and a small hack
  // (see the warning)
  const executeTransformation = (req, res, clojure, type, acceptType, successCallback, errorCallback) => {
    // 'pipe' is the default type
    if (type !== 'graft') {
      type = 'pipe';
    }

    const stream = downloadRaw(req, res);
    if (!stream) return;

    // When DataGraft has returned an answer
    stream.on('response', (response) => {
      // If the requests has failed, the request is just transferred to the client
      // so it can parse or display the DataGraft error
      if (!response || response.statusCode !== 200) {
        // if not deleted, these headers are forwarded from the service, which could cause CORS errors
        delete response.headers['access-control-allow-credentials'];
        delete response.headers['access-control-allow-origin'];
        stream.pipe(res);
        return;
      }

      // Load informations about the raw file
      const streamInfos = getAttachmentInfos(response);

      var knownLength;
      if (response.headers && response.headers['content-length']) {
        knownLength = parseInt(response.headers['content-length']);
      } else {
        // /!\ beware of the wild constant /!\
        // This is a hack to send the file and the pipeline in a streaming mode
        // when we don't know the size of the file.
        // The value just have to be very big so the file is not cut.
        // We cannot compute the real length of the file because we don't know
        // it before we start streaming this request.
        // It seems that graftwerk works fine using this hack, but it might
        // change in the future.
        knownLength = 10000000000;
      }

      // Graftwerk Request
      const formData = {
        pipeline: {
          value: clojure,

          // Graftwerk requires a Clojure transformation file
          // so we create a virtual one
          options: {
            filename: 'pipeline.clj',
            contentType: 'text/plain'
          }
        },
        data: {
          value: stream,
          options: {
            filename: streamInfos.filename,
            contentType: streamInfos.mime,
            knownLength: knownLength
          }
        },
        command: req.query.command || ('my-' + type)
      };

      // If a specific page is required, it is transmitted to Graftwerk
      if (typeof req.query.page !== undefined) {
        formData.page = parseInt(req.query.page) || 0;
      }

      // The page size can also be configured
      if (req.query.pageSize) {
        formData['page-size'] = parseInt(req.query.pageSize) || 50;
      }

      // The cache is not enabled by default, but it is recommended
      // for long and slow queries as the client HTTP timeout may occur
      // long before Graftwerk returns the result.

      const endpoint = (req.query.useCache || (req.body && req.body.useCache)) ?
        settings.graftwerkCacheUri : settings.graftwerkUri;

      const headers = {
        // /!\ This is mandatory to be able to send the file in a streaming mode
        'transfer-encoding': 'chuncked',
      };
      
      if (acceptType) {
        headers.Accept = acceptType;
      }

      // Querying Graftwerk
      const resultStream = request.post({
        url: endpoint + '/evaluate/' + type,
        headers,
        formData
      });

      resultStream.on('error', (err) => {
        showAndLogError(res, 500, 'Unable to transform the file using the original transformation', err);
        stream.abort();
      }).on('response', (response) => {

        // If the response is non valid
        if (!response || response.statusCode !== 200) {

          // Fetch the response string
          var outputError = concat({
            encoding: 'string',
          }, function(graftwerkOutput) {

            // Display the error, using the callback or the default system
            if (errorCallback) {
              logging.error('Unable to transform the file with Graftwerk', graftwerkOutput);
              errorCallback(graftwerkOutput);
            } else {
              showAndLogError(res, 500, 'Unable to transform the file with Graftwerk', graftwerkOutput);
            }
          });

          resultStream.pipe(outputError);

          logging.error('The transformed data is invalid', {
            response: response ? response.statusCode : 'response empty'
          });
          return;
        }

        // Remove the access control headers, so they don't override the
        // working ones
        delete response.headers['access-control-allow-credentials'];
        delete response.headers['access-control-allow-origin'];

        // Run the callback
        if (successCallback) {
          var filename = streamInfos.name.replace(/[^a-zA-Z0-9_\-]/g, '') + '-processed';
          successCallback(resultStream, response, filename, type);
        } else {
          // Or just pipe to the default output by default
          resultStream.pipe(res);
        }
      });
    });
  };

  const transformDistribution = (req, res, distribution, transformation, type, callbackSuccess, callbackError) => {
    // Fetch the clojure code from DataGraft
    request.get({
      url: settings.datagraftUri + '/myassets/transformations/' +
        encodeURIComponent(transformation) + '/configuration/code',
      headers: {
        Authorization: getAuthorization(req)
      }
    }, (error, response, clojure) => {
      if (error) {
        showAndLogError(res, 500, 'Unable to load the transformation code', error);
        return;
      }
    var acceptMimeType = mime.lookup(req.query.rdfFormat);
      executeTransformation(req, res, clojure, type,
        (type === 'graft' ? acceptMimeType : 'application/csv'),
        callbackSuccess,
        callbackError);
    });
  };

  const transformAndSaveTemporarilyDistribution = (req, res, distribution, transformation, type, callbackSuccess) =>  {
    transformDistribution(req, res, distribution, transformation, type,
      (resultStream, response, filename, type) => {
        // If we are here and the status is not correct, we display the output
        if (!response || response.statusCode !== 200) {
          stream.pipe(res);
          return;
        }

        // Create a temporary file to save the output from Graftwerk
        // The problem is that Graftwerk doesn't send a content-length
        // for RDF (only CSV), so we have to save it first before fowarding
        // it to the next component
        var tmpPath = temp.path('grafterizer-save', 's-');
        /*jshint bitwise: false*/
        var tmpWriteStream = fs.createWriteStream(tmpPath, {
          flags: constants.O_CREAT | constants.O_TRUNC | constants.O_RDWR | constants.O_EXCL,
          mode: '0600'
        });
        /*jshint bitwise: true*/

        // Save in the temporary file
        resultStream.pipe(tmpWriteStream);

        // When the file has finished to be received from Graftwerk
        tmpWriteStream.on('finish', () => {
          callbackSuccess(tmpPath);
        }).on('error', (err) => {
          fs.unlink(tmpPath);
          showAndLogError(res, 500, 'Error while transmitting the transformed data to the database', err);
        });
      });
  };

  // Download the raw distribution file content
  // Graftwerk is not involved in the process
  app.get('/preview_raw/:distribution', (req, res) => {
    const stream = downloadRaw(req, res);
    if (stream) stream.pipe(res);
  });

  // Transfrom the distribution with an empty transformation
  // to parse the file and show the original content.
  // Graftwerk is involved in the process, to parse the file
  app.get('/preview_original/:distribution', (req, res) => {
    executeTransformation(req, res,

      // This transformation is very simple and is just used to parse the file
      // using Graftwerk
      '(defpipe my-pipe [data-file] (-> (read-dataset data-file)))',
      'pipe');
  });

  // Transformation previewing
  // The data distribution is loaded from DataGraft and previewed using Graftwerk
  // The transformation code is sent by the client in the HTTP request body
  // The posted document should be formatted using JSON (and not the often default form-data)
  app.post('/preview/:distribution', jsonParser, (req, res) => {
    // Loading the clojure code from the request body
    const clojure = req.body && req.body.clojure;

    // If the clojure code is missing, the request is aborted
    if (!clojure) {
      showAndLogError(res, 400, 'The clojure transformation code is missing');
      return;
    }

    // If the client tries to send a number, an array or whatever
    // it's probably better to abort the request now
    if (typeof req.body.clojure !== 'string') {
      showAndLogError(res, 400, 'The clojure transformation code is not a string');
      return;
    }

    executeTransformation(req, res, clojure, req.body.transformationType);
  });

  // Execute and download the transformation on the distribution
  // Unlike the other methods, the code is not sent by the client but fetched
  // from DataGraft. To have a GET request with few parameters.
  app.get('/transform/:distribution/:transformation', (req, res) => {

    transformDistribution(req, res, req.params.distribution, req.params.transformation,
      req.query.type, (stream, response, filename, type) => {

        // Replace the headers to download a nice file
        if (!req.query.useCache) {
          delete response.headers['content-disposition'];
          delete response.headers['content-type'];
          delete response.headers.server;

          if (type === 'graft') {
              res.contentType(mime.lookup(req.query.rdfFormat));
              res.setHeader('content-disposition', 'attachment; filename=' + filename + '.' + req.query.rdfFormat);
          } else {
            res.contentType('text/csv');
            res.setHeader('content-disposition', 'attachment; filename=' + filename + '.csv');
          }
        }

        stream.pipe(res);
      },

    // Show the error in a slightly improved way
    (message) => {
      res.status(500);

      if (!req.query.raw) {
        res.send(downloadErrorText.replace('{{OUTPUT}}', escape(message)));
      } else {
        res.json({
          error: message
        });
      }
    });

  });

  // Transform a distribution using a transformation
  // Saves the output in a repository
  app.post('/fillRDFrepo', jsonParser, (req, res) => {
    var transformationUri = req.body.transformation;
    var distributionUri = req.body.distribution;
    var queriableDataStoreUri = req.body.queriabledatastore;
    var isOntotext = !!req.body.ontotext;

    if (!transformationUri) {
      showAndLogError(res, 400, 'The transformation URI is missing');
      return;
    }

    if (!distributionUri) {
      showAndLogError(res, 400, 'The distribution URI is missing');
      return;
    }

    if (!queriableDataStoreUri) {
      showAndLogError(res, 400, 'The queriable data store URI is missing');
      return;
    }

    if (isOntotext) {
      // We need to fetch an ontotext key
      request.get({
        url: settings.datagraftUri + '/api_keys/first',
        headers: {
          Authorization: getAuthorization(req)
        }
      }, (err, response, body) => {

        // Errors management
        if (err) {
          showAndLogError(res, 500, 'Unable to fetch an Ontotext Key from DataGraft', err);
          return;
        }

        // Creation of the Basic authorization header
        var authorization = 'Basic ' + (new Buffer(body).toString('base64'));

        // Query a select count to check if the database is ready
        // If this request fails, it's not necessary to execute the transformation
        request.get({
          url: queriableDataStoreUri,
          qs: {
            query: 'SELECT (count(*) as ?count) WHERE {?s ?p ?o . }'
          },
          headers: {
            Authorization: authorization,
            Accept: 'application/sparql-results+json',
          }
        }, (err, response, body) => {
          // If we have an error, the repository is likely not ready yet
          if (err) {
            showAndLogError(res, 503, 'The repository is not accessible', err);
            return;
          }

          // Execute the transformation
          transformAndSaveTemporarilyDistribution(req, res, distributionUri, transformationUri, 'graft',
            (tmpPath) => {

              // Save the stream in the database
              var saveStream = request.post({
                url: queriableDataStoreUri + '/statements',
                headers: {
                  Authorization: authorization,
                  'Content-Type': 'text/x-nquads;charset=UTF-8'
                },
              });

              // When the received the response, the database has received the file
              saveStream.on('response', (response) => {

                // The file is deleted once it has been received
                fs.unlink(tmpPath);

                // Redirect the output from the database to the client
                // With ontotext, it's only a HTTP 204 OK, but it might contain
                // more information in the future.
                saveStream.pipe(res);

              }).on('error', (err) => {
                fs.unlink(tmpPath);
                showAndLogError(res, 500, 'Error while transmitting the transformed data to the database', err);
              });
              
              fs.createReadStream(tmpPath).pipe(saveStream);
            });
        });
      });
    } else {
      showAndLogError(res, 501, 'Only Ontotext Queriable Data Stores are supported');
      return;
    }

  });

  // Transform a distribution using a transformation
  // Saves the output in a wizard instance
  app.post('/fillWizard', jsonParser, (req, res) => {
    var transformationUri = req.body.transformation;
    var distributionUri = req.body.distribution;
    var wizardId = req.body.wizardId;
    var transformationType = req.body.type;

    if (!transformationUri) {
      showAndLogError(res, 400, 'The transformation URI is missing');
      return;
    }

    if (!distributionUri) {
      showAndLogError(res, 400, 'The distribution URI is missing');
      return;
    }

    if (!wizardId) {
      showAndLogError(res, 400, 'The wizard ID is missing');
      return;
    }

    if (!transformationType) {
      showAndLogError(res, 400, 'The transformation type (pipe, graft) is missing');
      return;
    }

    transformAndSaveTemporarilyDistribution(req, res, distributionUri, transformationUri, transformationType,
      (tmpPath) => {
        
        // Save the stream in the upwizard object
        var saveStream = request.put({
          url: settings.datagraftUri + '/myassets/upwizards/save_transform/' + 
            encodeURIComponent(wizardId),
          headers: {
            Authorization: getAuthorization(req)
          },
          formData: {
            'upwizard[type_of_transformed_file]': transformationType,
            'upwizard[transformed_file]': fs.createReadStream(tmpPath)
          }
        });

        saveStream.on('response', (response) => {
          // The file is deleted once it has been received
          fs.unlink(tmpPath);
          saveStream.pipe(res);
        }).on('error', (err) => {
          fs.unlink(tmpPath);
          showAndLogError(res, 500, 'Error while transmitting the transformed data back to Datagraft', err);
        });
      });
  });
};
