"use strict";

var config = require('./config-mmichon.js');

const express = require('express');
const app = express();
app.use(express.json());

// const RingApi = require('ring-client-api');
import { RingApi } from 'ring-client-api';
const BlynkLib = require('blynk-library');
const exec = require('child_process').exec;
const execSync = require('child_process').execSync;

// var ringApi = new RingApi();
const ringApi = RingApi;
var blynk = BlynkLib;
var blynk_bridge_entrance;
var blynk_bridge_common;
var blynk_button_auto_open;
var blynk_button_send_notifications;

// global flags
var auto_open = true;
var send_notification = true;


function log_line(log_message, log_to_blynk = false) {
    var human_date = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
    var msg_with_prefix = human_date + " ring-blynk: " + log_message;

    console.log(msg_with_prefix);

    // if we're asked to log to Blynk and we're connected to it
    if (log_to_blynk && (typeof blynk_bridge_common != "undefined"))
        blynk_bridge_common.virtualWrite(config.blynk_pin_terminal, msg_with_prefix + "\n"); // push the open gate button
}

// this requires the TZ env variable to be set to the local timezone
function is_daytime() {
    var date = new Date();
    var hour_of_day = date.getHours();
    var is_daytime;

    if ((hour_of_day >= config.morning_hour) && (hour_of_day <= config.evening_hour)) {
        is_daytime = true;
    }
    else {
        is_daytime = false;
    }

    return is_daytime;
}

// connect to Ring API
async function ring_connect() {
    try {
        const { env } = process,
            ringApi = new RingApi({
                email: config.ring_account,
                password: config.ring_password,
                cameraDingsPollingSeconds: 1
            }),
            locations = await ringApi.getLocations(),
            allCameras = await ringApi.getCameras()

        log_line('Connected to Ring');

        if (allCameras.length) {
            allCameras.forEach(camera => {
                camera.onNewDing.subscribe(ding => {
                    got_ring_activity(ding)
                })
            })
        }

        // ringApi.events.on('activity', got_ring_activity);
    }
    catch (err) {
        log_line("ERROR: Couldn't connect to Ring!");
    }
}

// handle Ring activity events, such as doorbell rings ("dings") or detected motion
var got_ring_activity = async function (activity) {
    // uncomment to dump verbose activity event info;
    //log_line("Activity detected:\n", activity

    var human_date = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
    log_line("⚠️  Activity detected", false);

    if (activity.kind == "ding") {
        log_line("Someone rang the doorbell", true)

        doorbell_rung();

        // wait one minute and show the latest video in the Blyk append
        // setTimeout(function () {
        //     get_ring_video();
        // }, config.video_wait_time * 1000);
    }

    if (activity.kind == "motion") {
        log_line("Ring saw motion", true)

        // uncomment to send the latest motion-sensed video to Blynk
        //get_ring_video();
    }
}

// wait for Ring video and set a Blynk video widget to show it
// async function get_ring_video() {
//     const history = await ringApi.history();
//     const firstVideoUrl = await history[0].videoUrl();

//     // set the Blynk video widget to show the video
//     blynk.setProperty(config.blynk_pin_video, "url", firstVideoUrl);

//     log_line('Latest video URL posted to Blynk');
// }

// connect to Blynk API
async function blynk_connect() {
    try {
        blynk = new BlynkLib.Blynk(config.blynk_doorbell_auth_token);

        blynk_button_auto_open = new blynk.VirtualPin(config.blynk_pin_auto_open);
        blynk_button_send_notifications = new blynk.VirtualPin(config.blynk_pin_send_notifications);

        blynk_button_auto_open.on('write', function (param) {  // reads state of auto open setting
            auto_open = (param == 1);

            log_line("Auto-open set to: " + auto_open)
        });

        blynk_button_send_notifications.on('write', function (param) {  // reads state of notifications setting
            send_notification = (param == 1);

            log_line("Send notifications set to: " + send_notification)
        });

        blynk.on('connect', function () {
            blynk.syncAll();

            blynk_bridge_entrance = new blynk.WidgetBridge(3);
            blynk_bridge_entrance.setAuthToken(config.blynk_entrance_auth_token);

            blynk_bridge_common = new blynk.WidgetBridge(4);
            blynk_bridge_common.setAuthToken(config.blynk_common_auth_token);

            log_line('Connected to Blynk');
            // log_line("Started bridge service", true);
        });
    }
    catch (err) {
        log_line("ERROR: Couldn't connect to Blynk!");
    }
}

// captures a still image from an RTSP stream, uploads it to S3, and sets a Blynk Image widget to its URL
async function capture_front_door_image(image_pin, timestamp_pin, send_email) {
    var iso_date = new Date().toISOString();
    var human_date = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
    var entrance_capture_filename = config.entrance_capture_dir + iso_date + '.jpg'
    //var sudo = ''; // if running local
    var sudo = 'sudo -u ubuntu'; // if running on Linux

    // capture a still image from the RTSP stream of another camera
    try {
        // TODO move crop setting to config
        execSync('ffmpeg -rtsp_transport tcp -loglevel fatal -i "' + config.rtsp_url + '" -vframes 1 -r 1 -filter:v "crop=745:375:500:165" ' + entrance_capture_filename);

        var s3_url = 's3://' + config.s3_bucket + "/" + config.s3_dir + "/" + iso_date + ".jpg";
        log_line("S3 URL for static camera image: " + s3_url);

        // copy image to S3
        execSync(sudo + ' aws s3 cp ' + entrance_capture_filename + ' ' + s3_url);

        // parse out the filename of the newly-created image and set the image widget to the S3 URL of the image
        var image_url = config.s3_url + "/" + config.s3_bucket + "/" + config.s3_dir + "/" + iso_date + ".jpg";
        log_line('Setting image URL to ' + image_url);
        blynk.setProperty(image_pin, "urls", image_url);
        blynk.virtualWrite(image_pin, 1);

        // also set the timestamp in the Blynk app
        blynk.virtualWrite(timestamp_pin, human_date);
    }
    catch (err) {
        // log errors, but ignore them and move on
        log_line("ERROR: Couldn't capture image or send to S3");
    }

    if (send_email) {
        // asynchronously mail the image in an attachment
        try {
            exec('echo "See attached image." | mail -r ' + config.ring_account + ' -A ' + entrance_capture_filename + ' -s "Doorbell rung at ' + human_date + '" ' + config.ring_account);
        }
        catch (err) {
            log_line("ERROR: Couldn't mail image");
        }
    }

    // run the capture through AWS Rekognition and display relevant metadata in the Blynk app
    try {
        // iso_date ='2019-01-04-18-03-39'; // uncomment for test file
        var stdout = execSync(sudo + ' aws rekognition detect-faces --image "S3Object={Bucket=' + config.s3_bucket + ',Name=' + config.s3_dir + '/' + iso_date + '.jpg}" --attributes ALL --region us-west-2').toString();
        var faces_data = JSON.parse(stdout);
        var gender = faces_data.FaceDetails[0].Gender.Value.toLowerCase();
        var age_low = faces_data.FaceDetails[0].AgeRange.Low;
        var age_high = faces_data.FaceDetails[0].AgeRange.High;
        var description = `${gender} age ${age_low}-${age_high}`;

        log_line(`Detected ${description}`, true);
        blynk.virtualWrite(config.blynk_pin_face_description, description);
    }
    catch (err) {
        log_line("ERROR: Couldn't recognize faces or exec Rekognition");

        blynk.virtualWrite(config.blynk_pin_face_description, "(undetected)");
    }
}

// handle doorbell ring events with Blynk logic to open a gate
async function doorbell_rung() {
    // TODO: wrap logs in function that sends to common Blynk terminal as well
    log_line("Setting doorbell state button")
    blynk.virtualWrite(config.blynk_pin_doorbell_state, 1);  // turn doorbell state button to On

    setTimeout(function () { // asynchronously reset the open gate button in a few seconds
        log_line("Restoring doorbell state button")

        blynk.virtualWrite(config.blynk_pin_doorbell_state, 0);  // turn doorbell state button to Off
    }, config.doorbell_state_duration * 1000);

    // Send a push notification if that's enabled in a Blynk button
    if (send_notification) {
        log_line("Blynk notified of doorbell ring");

        var notification = "Someone is ringing the doorbell! Check your email for photo.";

        if (auto_open && is_daytime()) {
            notification = notification + " Auto-opening the entrance.";
        }

        blynk.notify(notification);
    }

    // open the gate if that's enabled in a Blynk button
    if (auto_open && is_daytime()) {
        log_line("Opening gate");

        setTimeout(function () {
            blynk_bridge_entrance.virtualWrite(config.blynk_pin_open_gate, 1); // push the open gate button
        }, config.push_gate_button_delay * 1000);

        // reset the open gate button a few seconds after that
        setTimeout(function () {
            log_line("Closing gate");

            blynk_bridge_entrance.virtualWrite(config.blynk_pin_open_gate, 0);
        }, (config.push_gate_button_delay + config.push_gate_button_duration) * 1000);
    }
    else {
        log_line("Not opening gate because auto-open is disabled or it's nighttime", true);
    }

    log_line("Capturing and analyzing front door image");
    capture_front_door_image(config.blynk_pin_ring_image, config.blynk_pin_ring_timestamp, true);
}

// handle ctrl-c for c8 code coverage checks
process.on('SIGINT', function () {
    log_line("Caught interrupt signal");

    process.exit();
});

// Answer IFTTT webhooks to proxy Wyze events to Blynk
app.post('/wyze_event', (request, response) => {
    var sensor = request.body.sensor;
    var wyze_message = request.body.message;

    response.send("OK"); // IFTTT will never read this so it's whatever

    log_line(wyze_message, true);

    if (send_notification) {
        blynk.notify(wyze_message);
    }

    // Capture the image of the person opening the entrance
    if (wyze_message.trim() === "Contact Sensor opens on Entrance") {
        log_line("Capturing and analyzing front door image");
        capture_front_door_image(config.blynk_pin_open_image, config.blynk_pin_open_timestamp, false);
    }
});

// Web service
app.listen(config.http_port, (err) => {
    if (err) {
        return console.log('ERROR', err)
    }

    console.log(`Server is listening on ${config.http_port}`)
});

// connect to APIs
ring_connect();
blynk_connect();