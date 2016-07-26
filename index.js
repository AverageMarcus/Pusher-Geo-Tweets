"use strict";
const Hapi = require('hapi');
const server = new Hapi.Server();
const ngeohash = require('ngeohash');
const Twitter = require('twitter');
const Pusher = require('pusher');
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_APP_KEY,
  secret: process.env.PUSHER_SECRET_KEY,
  cluster: process.env.PUSHER_CLUSTER,
  encrypted: true
});
const twitter = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
});
// Currently limiting to England
const gbStream = twitter.stream('statuses/filter', {locations: '-7.28,50.26,1.76,58.95'});

let channels = new Set();

server.connection({
  port: process.env.PORT || 8000
});

server.register([require('inert')], (err) => {
  if (err) {
    throw err;
  }

  server.route({
    method: 'POST',
    path:'/channelhook',
    handler: function (request, reply) {
      const webhook = pusher.webhook({
        rawBody: JSON.stringify(request.payload),
        headers: request.headers
      });

      if(!webhook.isValid()) {
        console.log('Invalid webhook')
        return reply(400);
      } else {
        reply(200);
      }

      webhook.getEvents().forEach( e => {
        if(e.name == 'channel_occupied') {
          channels.add(e.channel)
        }
        if(e.name == 'channel_vacated') {
          channels.delete(e.channel)
        }
      });
    }
  });

  // Static resources
  server.route({
    method: 'GET',
    path: '/{param*}',
    handler: {
      directory: {
        path: 'public'
      }
    }
  });

});

server.start((err) => {
  if (err) {
    throw err;
  }

  gbStream.on('data', function(tweet) {
    if(tweet.geo) {
      let hash = ngeohash.encode(tweet.geo.coordinates[0], tweet.geo.coordinates[1], 4);
      if(channels.has(hash)) {
        pusher.trigger(hash, 'tweet', tweet);
      }
    }
  });
});
