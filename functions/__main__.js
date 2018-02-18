'use strict';

const https = require('https');
const Houndify = require('houndify');
const async = require('async');
const fs = require('fs');
const wav = require('wav');
const lib = require('lib')({
  token: 'ZEVH1Xx3sZ8IMJomI7xxQQJRVNwQbIVJvjJ0YumCwVCOqToa5v6PcDoiNkFmilmL'
});
/**
 * SoundByte: A transcription helper for easier patient doctor interaction
 * @param {string} recording
 * @param {string} doctorNumber
 * @param {string} patientNumber
 * @param {string} doctorName
 * @param {string} patientName
 * @returns {any}
 */
module.exports = (recording, doctorNumber, patientNumber, doctorName, patientName, context, callback) => {
console.log(context.params);
var b64string = recording;
var buf = Buffer.from(b64string, 'base64');
console.log(buf)
  //let {recording, doctorNumber, patientName, doctorName, patientName } = context.params;
  lib({bg: true})['akul-goyal.mongo']['@dev'].insert({item: recording}, (err, dbresult) => {

    fs.writeFileSync('/tmp/blah.wav', recording)
    //final string to be texted to user
    let final_string = ''
    callHoundify((err, results) => {
      if (err) {
        return callback(err);
      }
      let transcript = results;

      keyWordFinder(transcript, (error, results) => {

        let keywords = results.documents[0].keyPhrases

        let docArrayPromises = keywords.map((keyword) => {
          return getNotes(keyword);
        });

        Promise.all(docArrayPromises).then(results => {
          final_string = results.join('\n')
          console.log('final_string', final_string)
          console.log('number: ', doctorNumber);
          return lib.utils.sms({
            to: doctorNumber, //this could be our number too
            body: final_string
          }, (err, response) => {
            if (err) {
              return callback(err)
            }
            console.log('text response', response);
            return callback(null, final_string);
          });
        }).catch(err => {
          return callback(err)
        })

      });

    });


  }) //async?

}

//sets the request for houndify
function callHoundify(callback) {

  function startVoiceRequest(sampleRate) {
    return new Houndify.VoiceRequest({

      clientId: "7NCkgc-KOkGBa907MzMqJA==",
      clientKey: "6RbYph51BIHVwVjGY8g_DaKkZjHyGqRYYlT5Czntxee3PNzSybjr1qafwlvbYl1S4t24Alh4rtJOlLs5mFVTMQ==",


      sampleRate: 16000,

      requestInfo: {
        UserID: "test_user",
        Latitude: 37.388309,
        Longitude: -121.973968
      },

      onResponse: function(response, info) {
        return callback(null, response.Disambiguation ? response.Disambiguation.ChoiceData[0].Transcription : '');
      },

      onError: function(err, info) {
        console.log(err);
      }

    });
  }
  var voiceRequest;
  var reader = new wav.Reader();

  reader.on('format', function(format) {
    voiceRequest = startVoiceRequest();
  });

  reader.on('data', function(chunk) {
    var arrayBuffer = new Uint8Array(chunk).buffer;
    var view = new Int16Array(arrayBuffer);
    voiceRequest.write(view);
  });

  reader.on('end', function() {
    voiceRequest.end();
  });

  var file = fs.createReadStream('/tmp/blah.wav');
  file.pipe(reader);

}

//microsoft speech keyword analyzer.
//finds the key words inside of text using microsoft cognitive services
function keyWordFinder(transcript, callback) {
  let accessKey = 'b8857193e0c84f448c91c81cd7d180b0';
  let uri = 'westcentralus.api.cognitive.microsoft.com';
  let path = '/text/analytics/v2.0/keyPhrases';

  let get_key_phrases = function(documents, callback) {
    let documentsString = JSON.stringify(documents);

    let request_params = {
      method: 'POST',
      hostname: uri,
      path: path,
      headers: {
        'Ocp-Apim-Subscription-Key': accessKey,
      }
    };

    let req = https.request(request_params, (response) => {
      let body = '';
      response.on('data', function(chunk) {
        body += chunk;
      });
      response.on('end', function() {
        let parsedBody = JSON.parse(body);
        return callback(null, parsedBody);
        // let body__ = JSON.stringify (body_, null, '  ');
      });
      response.on('error', function(e) {
        console.log('Error: ' + e.message);
        return callback(error)
      });
    });

    req.write(documentsString);
    req.end();
  }

  let documents = {
    'documents': [{
      'id': '1',
      'language': 'en',
      'text': transcript
    }]
  };
  get_key_phrases(documents, (err, results) => {
    if (err) {
      return callback(err)
    }
    return callback(null, results)
  });
}


//microsoft search entity.
//finds little blurbs on each cognitive service
function getNotes(keyword) {
  return new Promise((resolve, reject) => {
    let accessKey = '6b492d34fce041fa9dc982ebf6aa29cb';
    let uri = 'api.cognitive.microsoft.com';
    let path = '/bing/v7.0/entities';
    let mkt = 'en-US';
    let q = keyword;
    let params = '?mkt=' + mkt + '&q=' + encodeURI(q);
    let get_key_phrases = function(callback) {
      let request_params = {
        method: 'GET',
        hostname: uri,
        path: path + params,
        headers: {
          'Ocp-Apim-Subscription-Key': accessKey,
        }
      };

      let req = https.request(request_params, (response) => {
        let body = '';
        response.on('data', function(chunk) {
          body += chunk;
        });
        response.on('end', function() {
          let body_ = JSON.parse(body);
          let ogResult = body_.queryContext.originalQuery;
          let descript = ''
          let final = ''
          if (body_.entities != null) {
            descript = body_.entities.value[0].description
            final = ogResult + ': ' + descript
          } else {
            final = 'No information on ' + ogResult
          }

          return resolve(final);
        });
        response.on('error', function(e) {
          console.log('Error: ' + e.message);
          return reject(error)
        });
      });
      req.end();
    }

    get_key_phrases((err, results) => {
      if (err) {
        return reject(err)
      }
      return resolve(results)
    });

  })

}
