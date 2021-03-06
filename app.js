/*global require, Promise */
/*jslint node: true nomen: true es5: true */

'use strict';

var express = require('express'),
    app = express(),
    moment = require('moment'),
    fs = require('fs'),
    /* Gooogle Cloud Config */
    GCLOUD_PROJECT = 'mauijim-1289',
    gcloud = require('gcloud')({
        projectId: GCLOUD_PROJECT,
        keyFilename: 'google_keyfile.json'
    }),
    datastore = gcloud.datastore({}),
    kind = 'Event',
    gcs = gcloud.storage(),
    bucket = gcs.bucket('mauijim-1289.appspot.com'),
    /* app config */
    exphbs = require('express-handlebars'),
    bodyParser = require('body-parser'),
    multer = require('multer'),
    storage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, __dirname + '/uploads');
        },
        filename: function (req, file, cb) {
            cb(null, Date.now() + '-' + file.originalname);
        }
    }),
    upload = multer({
        dest: 'uploads/',
        storage: storage
    }),
    port = 3000;

/* Handlebars view engine */
app.engine('handlebars', exphbs({
    defaultLayout: 'main'
}));
app.set('view engine', 'handlebars');

/* Post body support */
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

/* Static Routes */
app.use(express.static(__dirname + '/public'));
app.use('/uploads', express.static(__dirname + '/uploads'));
app.use('/bower_components', express.static(__dirname + '/bower_components'));

/* Functionality */
app.use('/new', function (req, res, next) {
    res.render('newEvent', {});
});

app.get('/events', function (req, res, next) {
    var query = datastore.createQuery([kind]),
        upcomingEvents = [],
        pastEvents = [];

    /*
        This is loading pretty syncronously; ideally, we could have the fron-end stream the datastore objects and inject them into the DOM as a stream.
    */

    datastore.runQuery(query)
        .on('error', console.error)
        .on('data', function (entity) {

            // sort events into "upcoming" and "past"
            var now = moment(),
                then = moment(entity.data.dateStart, 'MM-DD-YYYY');

            if (now.isBefore(then)) {
                upcomingEvents.push({
                    id: entity.key.id,
                    name: entity.data.name,
                    summary: entity.data.summary,
                    location: entity.data.location,
                    description: entity.data.description,
                    dateStart: entity.data.dateStart,
                    dateEnd: entity.data.dateEnd,
                    timeStart: entity.data.timeStart,
                    timeEnd: entity.data.timeEnd,
                    blogPostUrl: entity.data.blogPostUrl,
                    eventType: entity.data.eventType,
                    externalUrl: entity.data.externalUrl,
                    featuredImage: entity.data.featuredImage,
                    photos: entity.data.photos ? JSON.parse(entity.data.photos) : ''
                });
            } else {
                pastEvents.push({
                    id: entity.key.id,
                    name: entity.data.name,
                    summary: entity.data.summary,
                    location: entity.data.location,
                    description: entity.data.description,
                    dateStart: entity.data.dateStart,
                    dateEnd: entity.data.dateEnd,
                    timeStart: entity.data.timeStart,
                    timeEnd: entity.data.timeEnd,
                    blogPostUrl: entity.data.blogPostUrl,
                    eventType: entity.data.eventType,
                    externalUrl: entity.data.externalUrl,
                    featuredImage: entity.data.featuredImage,
                    photos: entity.data.photos ? JSON.parse(entity.data.photos) : ''
                });
            }
        })
        .on('end', function () {
            // all entities retrieved
            res.render('events', {
                upcomingEvents: upcomingEvents,
                pastEvents: pastEvents
            });
        });
});

app.get('/', function (req, res, next) {
    res.redirect('/events');
});

app.post('/', upload.array(), function (req, res, next) {
    var eventData = {
            name: req.body.eventName,
            summary: req.body.summary,
            location: req.body.eventLocation,
            description: req.body.description,
            dateStart: req.body.dateStart,
            dateEnd: req.body.dateEnd,
            timeStart: req.body.timeStart,
            timeEnd: req.body.timeEnd,
            blogPostUrl: req.body.blogPostUrl,
            eventType: req.body.eventType,
            externalUrl: req.body.externalUrl,
            featuredImage: req.body.featuredImage,
            photos: req.body.photosArray
        },
        eventKey = datastore.key(kind);

    // save to google datastore
    datastore.save({
        key: eventKey,
        data: eventData
    }, function (err, apiResponse) {
        if (err) {
            console.log(apiResponse);
            console.log(err);
        }
        res.redirect('/events');
    });
});

app.post('/updateEvent', upload.array(), function (req, res, next) {
    var eventData = {
            name: req.body.eventName,
            summary: req.body.summary,
            location: req.body.location,
            description: req.body.description,
            dateStart: req.body.dateStart,
            dateEnd: req.body.dateEnd,
            timeStart: req.body.timeStart,
            timeEnd: req.body.timeEnd,
            blogPostUrl: req.body.blogUrl,
            eventType: req.body.eventType,
            externalUrl: req.body.externalUrl,
            featuredImage: req.body.featuredImage,
            photos: req.body.photos
        },
        eventId = parseInt(req.body.id, 10),
        eventKey = datastore.key(['Event', eventId]);

    //    res.send(eventKey);

    // update db entry
    datastore.update({
        key: eventKey,
        data: eventData
    }, function (err, apiResponse) {
        if (err) {
            console.log(err);
            res.status(500).send('Datastore update failed');
        } else {
            // return updated entity
            datastore.get(eventKey, function (err, entity) {
                if (err) {
                    console.log(err);
                    res.status(500).send('Error getting event from db');
                }
                res.status(200).send(JSON.stringify(entity));
            });
        }
    });
});

app.post('/photoUpload', upload.single('file'), function (req, res, next) {
    var uploadOptions = {
        public: true
    };

    // upload to google cloud storage
    bucket.upload(req.file.path, uploadOptions, function (err, file2) {
        if (err) {
            console.log(err);
        }

        fs.unlink(req.file.path);

        res.status(200).send(file2.metadata.mediaLink);
    });
});

app.post('/deleteEvent', function (req, res, next) {
    var eventId = parseInt(req.body.id, 10),
        eventKey = datastore.key(['Event', eventId]);

    // delete event entity
    datastore.delete(eventKey, function (err, apiResponse) {
        if (err) {
            console.log(err);
            console.log(apiResponse);
            res.send(500).send('Error while deleting event');
        }

        res.status(200).send('Event successfully deleted');

    });

    // should delete associated images in storage
});

// Basic 404 handler
app.use(function (req, res) {
    res.status(404).send('Not Found');
});

// Basic error handler
app.use(function (err, req, res, next) {
    /* jshint unused:false */
    console.error(err);
    // If our routes specified a specific response, then send that. Otherwise,
    // send a generic message so as not to leak anything.
    res.status(500).send(err.response || 'Something broke!');
});

app.listen(process.env.PORT || port, function () {
    console.log('Server listening on port 3000 \nhttp://localhost:3000');
});
