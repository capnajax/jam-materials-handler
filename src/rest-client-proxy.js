'use strict';

/**
 * URL Assistant - A configurable HTTP proxy server for educational environments
 * 
 * This server provides a proxy service that allows students to access backend services
 * through a unified interface. It supports:
 */

import fs from 'fs';
import https from 'https';
import http from 'http';
import path from 'path';

// HTTPS agent that accepts self-signed certificates for development environments
const agent = new https.Agent({
  rejectUnauthorized: false
});

// Load configuration file (defaults to ./config.json)
const configFile = process.env.CONFIG || '/opt/app-root/template/config.json';

// Parse the configuration containing host mappings
const config = JSON.parse(fs.readFileSync(configFile).toString());

/**
 * Serves as a proxy server that forwards requests to configured backend hosts.
 * 
 * Route format: /proxy/{student}/{origin}/{path}
 * - student: Identifier for the student/user
 * - origin: The backend service origin identifier
 * - path: The actual path to be proxied (optional, defaults to '/')
 * 
 * Features:
 * - URL mapping based on student and origin from config.hosts
 * - Header forwarding via x-proxy-headers (base64 encoded JSON)
 * - Basic authentication support
 * - Request body proxying for POST/PUT requests
 * - Response header and status code forwarding
 * - HTTPS agent with disabled certificate validation
 * 
 * @param {http.IncomingMessage} req - The incoming HTTP request
 * @param {http.ServerResponse} res - The HTTP response object
 * @returns {Promise<string>} A promise that resolves to a status string
 */
function serveProxy(req) {
	return new Promise((resolve, reject) => {
	  const method = req.method;
  	const urlMatch = req.url.match(new RegExp('/proxy/([^/]*)/(.*)?$'));

    const result = {
      headers: [],
      bodyChunks: [],
      body: Buffer.alloc(0),
      statusCode: 0,
      statusMessage: ''
    };

	  const end = () => {
  		console.log(`[PROXY] ${result.statusCode} ${req.method} ${req.url}`);
      resolve(result);
	  }

  	if (!urlMatch) {
    	result.statusCode=400;
    	end();
    	return;
  	}
	  const service = urlMatch[1];
  	const pathname = urlMatch[2] || '/';
  	const serviceConfig = config.hosts.find(h => {
    	return (h.service === service);
	  })?.baseUrl;
  	if (!serviceConfig) {
			// service was not in the list -- call it a bad request.
    	result.statusCode=400;
    	end();
  	  return;
	  }

    console.log('serviceConfig', serviceConfig);

		const baseUrl = `${serviceConfig}`;

	  const urlObj = new URL(baseUrl);

  	const headersHeader = req.headers['x-proxy-headers'];
	  const headers = headersHeader
	    ? JSON.parse(Buffer.from(headersHeader, 'base64').toString())
  	  : {};
  	const options = {
	    agent,
    	headers,
	    host: urlObj.host,
  	  method,
    	path: (urlObj.pathname === '/' ? '' : urlObj.pathname) + '/' +
      	(pathname.startsWith('/') ? pathname.slice(1) : pathname)
	  };
		if (serviceConfig.port) {
			options.port = serviceConfig.port;
		}
  	if (urlObj.username) {
    	if (urlObj.password) {
      	options.auth = `${urlObj.username}:${urlObj.password}`;
	    } else {
  	    options.auth = `${urlObj.username}:`;
    	}
  	}
	  if (urlObj.port) {
  	  options.port = urlObj.port;
  	}
  	options.headers.Host = urlObj.host;

	  const requestBodyChunks = [];
  	const requestBodyPromise = new Promise(r => {
    	req.on('data', d => {
      	requestBodyChunks.push(d.toString());
	    });
  	  req.on('end', () => {
    	  r();
    	});  
  	});

    console.log('urlObj', urlObj);

	  // proxied req
  	const preq = {http,https}[urlObj.protocol.replace(':','')].request(
    	options,
 	   (pres) => { // proxied res
  	    const chunks = [];
    	  pres.on('data', chunk => {
      	  result.bodyChunks.push(chunk);
	      });
  	    pres.on('end', () => {
          result.headers = pres.headers;
          result.statusCode = pres.statusCode;
          result.statusMessage = pres.statusMessage;

          const totalChunkSize = result.bodyChunks.reduce( (acc, chunk) => {
            return acc + chunk.length;
          }, 0);
          result.body = Buffer.alloc(totalChunkSize);
          let offset=0;
          result.bodyChunks.forEach(chunk => {
            result.body.write(chunk.toString(), offset);
            offset += chunk.length;
          });

          let isText = true;
          for (let i = 0; i < result.body.length; i++) {

            if (result.body[i] <= 6 ||
              (result.body[i] >= 14 && result.body[i] <= 31)
            ) {
              isText = false;
              break;
            }

          }
          if (isText) {
            result.body = result.body.toString();
          } else {
            result.body = result.body.toString('base64');
          }

          delete result.bodyChunks;

          end();
	      });
  	  });
	  preq.on('error', (e) => {
  	  result.status = 502;
    	console.log('Error in backend request:', e.message);
  	  end();
	  });

	  requestBodyPromise.then(() => {
  	  requestBodyChunks.forEach(c => {
    	  preq.write(c);
    	});
  	  preq.end();
	  });
	});
}

export default serveProxy;
