'use strict';

var config = require('./config.js');

const RingApi = require('ring-api');
var ringApi = RingApi;

const BlynkLib = require('blynk-library');
var blynk = BlynkLib;
var blynk_bridge_entrance;
var blynk_button_auto_open;
var blynk_button_send_notifications;

// global states
var auto_open = true;
var send_notification = true;


// connect to Ring API
async function ring_connect() {
    ringApi = await RingApi({
        email: config.ring_account,
        password: config.ring_password,
        poll: true,
    });

    console.log('Connected to Ring');

    ringApi.events.on('activity', got_ring_activity);
}

// handle Ring activity events, such as doorbell rings ("dings") or detected motion
var got_ring_activity = async function (activity) {
    // uncomment to dump activity event info
    //console.log("Activity detected:\n", activity);

    if (activity.kind == "ding") {
        console.log("Ring got a ding")

        doorbell_rung();

        get_ring_video();
    }

    if (activity.kind == "motion") {
        console.log("Ring saw motion")

        // uncomment to send the latest motion-sensed video to Blynk
        //get_ring_video();
    }
}

// wait for Ring video and set a Blynk video widget to show it
async function get_ring_video() {
    const history = await ringApi.history();
    const firstVideoUrl = await history[0].videoUrl();

    // set the Blynk video widget to show the video
    blynk.setProperty(config.blynk_pin_video, "url", firstVideoUrl);

    console.log('Latest video URL posted to Blynk');
}

// connect to Blynk API
async function blynk_connect() {
    blynk = new BlynkLib.Blynk(config.blynk_auth_token);

    blynk_button_auto_open = new blynk.VirtualPin(config.blynk_pin_auto_open);
    blynk_button_send_notifications = new blynk.VirtualPin(config.blynk_pin_send_notifications);

    blynk_button_auto_open.on('write', function (param) {  // reads state of auto open setting
        auto_open = (param == 1);

        console.log("Auto-open set to:", auto_open)
    });

    blynk_button_send_notifications.on('write', function (param) {  // reads state of notifications setting
        send_notification = (param == 1);

        console.log("Send notifications set to:", send_notification)
    });

    blynk.on('connect', function () {
        blynk.syncAll();

        blynk_bridge_entrance = new blynk.WidgetBridge(3);
        blynk_bridge_entrance.setAuthToken(config.blynk_bridge_auth_token);

        console.log("Blynk ready");
    });

    console.log('Connected to Blynk');
}

// request to capture a still image from the front entrace camera by hitting the backend service
async function request_image_capture_from_external_camera() {
    var filename;
    console.log("Requesting still image from remote camera");

    const http = require('http');
    http.get(config.external_camera_capture_url, (resp) => {
        let data = '';

        resp.on('data', (chunk) => {
            data += chunk;
        });

        // parse out the filename of the newly-created image and set the image widget to the S3 URL of the image
        resp.on('end', () => {
            filename = JSON.parse(data).filename;

            var url = config.s3_url + "/" + config.s3_bucket + "/" + config.s3_dir + "/" + filename + ".jpg";
            console.log("S3 URL for static camera image: " + url);

            blynk.setProperty(config.blynk_pin_image, "url", 1, url);
            blynk.virtualWrite(config.blynk_pin_image, 1);
        });
    }).on("error", (err) => {
        console.log("HTTP error: " + err.message);
    });
}

// handle doorbell ring events with Blynk logic to open a gate
async function doorbell_rung() {
    // asynchronously request a capture of the front camera image
    if (config.external_camera_capture_url) { request_image_capture_from_external_camera() };

    // TODO: wrap logs in function that sends to common Blynk terminal as well
    console.log("Setting doorbell state button")
    blynk.virtualWrite(config.blynk_pin_doorbell_state, 1);  // turn doorbell state button to On

    setTimeout(function () { // asynchronously reset the open gate button in a few seconds
        console.log("Restoring doorbell state button")

        blynk.virtualWrite(config.blynk_pin_doorbell_state, 0);  // turn doorbell state button to Off
    }, config.doorbell_state_duration * 1000);

    // Send a push notification if that's enabled in a Blynk button
    if (send_notification) {
        console.log("Blynk notified of doorbell ring");

        var notification = "Someone is ringing the doorbell! Check your email for photo.";

        if (auto_open) {
            notification = notification + " Auto-opening the entrance.";
        }

        blynk.notify(notification);
    }

    // open the gate if that's enabled in a Blynk button
    if (auto_open) { //TODO: add daytime check
        setTimeout(function () {
            console.log("Opening gate");
            blynk_bridge_entrance.virtualWrite(config.blynk_pin_open_gate, 1); // push the open gate button
        }, config.push_gate_button_delay * 1000);

        // reset the open gate button a few seconds after that
        setTimeout(function () {
            console.log("Closing gate");

            blynk_bridge_entrance.virtualWrite(config.blynk_pin_open_gate, 0);
        }, (config.push_gate_button_delay + config.push_gate_button_duration) * 1000);
    }
}

// connect to APIs
ring_connect();
blynk_connect();