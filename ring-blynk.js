'use strict';

var config = require('./config.js');

const RingApi = require('ring-api');
const BlynkLib = require('blynk-library');
const execSync = require('child_process').execSync;

var ringApi = RingApi;
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
    // uncomment to dump verbose activity event info;
    //console.log("Activity detected:\n", activity

    var human_date = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
    console.log("⚠️  Activity detected at " + human_date);

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

// synchronously execs a command and logs what was done
function exec_with_log(command) {
    //console.log('execing: ' + command);

    return (execSync(command).toString());
}

// captures a still image from an RTSP stream, uploads it to S3, and sets a Blynk Image widget to its URL
async function capture_front_door_image() {
    var iso_date = new Date().toISOString();
    var human_date = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
    var entrance_capture_filename = config.entrance_capture_dir + iso_date + '.jpg'
    //var sudo = ''; // if running local
    var sudo = 'sudo -u ubuntu'; // if running on Linux

    // catch and ignore shell errors, as these are
    try {
        // capture a still image from the RTSP stream
        // TODO move crop setting to config
        exec_with_log('ffmpeg -rtsp_transport tcp -loglevel fatal -i "' + config.rtsp_url + '" -vframes 1 -r 1 -filter:v "crop=745:375:500:165" ' + entrance_capture_filename);

        var s3_url = 's3://' + config.s3_bucket + "/" + config.s3_dir + "/" + iso_date + ".jpg";
        console.log("S3 URL for static camera image: " + s3_url);

        // copy image to S3
        exec_with_log(sudo + ' aws s3 cp ' + entrance_capture_filename + ' ' + s3_url);

        // parse out the filename of the newly-created image and set the image widget to the S3 URL of the image
        var image_url = config.s3_url + "/" + config.s3_bucket + "/" + config.s3_dir + "/" + iso_date + ".jpg";
        console.log('Setting image URL to ' + image_url);
        blynk.setProperty(config.blynk_pin_image, "urls", image_url);
        blynk.virtualWrite(config.blynk_pin_image, 1);

        // also set the timestamp in the Blynk app
        blynk.virtualWrite(config.blynk_pin_timestamp, human_date);
    }
    catch (err) {
        console.log("Couldn't capture image or send to S3");
    }

    try {
        // mail the uuencoded image in an attachment
        // TODO: can do this async
        exec_with_log('uuencode ' + entrance_capture_filename + ' entrance-capture.jpg | mail -r ' + config.ring_account + ' -s "Someone rang the doorbell at ' + iso_date + '" ' + config.ring_account);
    }
    catch (err) {
        console.log("Couldn't mail image");
    }

    try {
        // run it through AWS rekognition and capture the output
        //iso_date ='2019-01-04-18-03-39'; // uncomment for test file
        var stdout = exec_with_log(sudo + ' aws rekognition detect-faces --image "S3Object={Bucket=' + config.s3_bucket + ',Name=' + config.s3_dir + '/' + iso_date + '.jpg}" --attributes ALL --region us-west-2');
        var faces_data = JSON.parse(stdout);
        var gender = faces_data.FaceDetails[0].Gender.Value.toLowerCase();
        var age_low = faces_data.FaceDetails[0].AgeRange.Low;
        var age_high = faces_data.FaceDetails[0].AgeRange.High;
        var description = `${gender} age ${age_low}-${age_high}`;

        console.log(`Detected ${description}`);
        blynk.virtualWrite(config.blynk_pin_face_description, description);
    }
    catch (err) {
        console.log("Couldn't recognize faces or exec Rekognition");

        blynk.virtualWrite(config.blynk_pin_face_description, "(undetected)");
    }
}

// handle doorbell ring events with Blynk logic to open a gate
async function doorbell_rung() {
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

    console.log("Capturing and analyzing front door image");
    capture_front_door_image();
}

// connect to APIs
ring_connect();
blynk_connect();