"use strict"

require('dotenv').config({ path: './.env' })

// TODO: convert to .env file
// config vars
var config = require('./config-mmichon.js')

// libs
import { RingApi } from 'ring-client-api'
import { setInterval } from 'timers'
import { readFile, writeFile } from 'fs'
import { promisify } from 'util'
const express = require('express')
const server = express()
const BlynkLib = require('blynk-library')
const exec = require('child_process').exec
const execSync = require('child_process').execSync
const request = require("request")
const fs = require('fs')
const AWS = require('aws-sdk')
const ringApi = RingApi

// global objects
var ring_camera
var blynk = BlynkLib
var blynk_bridge_gate
var blynk_bridge_common
var blynk_button_auto_open
var blynk_button_send_notifications

// global flags
var auto_open = true
var send_notification = true
var controller_online = true

server.use(express.json())


function log_line(log_message, log_to_blynk = false) {
    var human_date = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
    var msg_with_prefix = human_date + " bridge: " + log_message

    console.log(msg_with_prefix)

    // if we're asked to log to Blynk and we're connected to it
    if (log_to_blynk && (typeof blynk_bridge_common != "undefined"))
        blynk_bridge_common.virtualWrite(config.blynk_pin_terminal, msg_with_prefix + "\n") // push the open gate button
}

// this requires the TZ env variable to be set to the local timezone
function is_within_auto_open_window() {
    var date = new Date()
    var hour_of_day = date.getHours()
    var is_within_auto_open_window

    if ((hour_of_day >= config.auto_open_start_hour) && (hour_of_day < config.auto_open_end_hour)) {
        is_within_auto_open_window = true
    }
    else {
        is_within_auto_open_window = false
    }

    return is_within_auto_open_window
}

// connect to Ring API
async function ring_connect() {
    try {
        const { env } = process

        const refresh_token = env.RING_REFRESH_TOKEN || config.ring_token
        log_line("Using refresh token: " + refresh_token, false)

        const ringApi = new RingApi({
            refreshToken: refresh_token,
            cameraDingsPollingSeconds: 2
        })
        const allCameras = await ringApi.getCameras()

        ringApi.onRefreshTokenUpdated.subscribe(
            async ({ newRefreshToken, oldRefreshToken }) => {
                log_line('🚩 Refresh token updated: ' + newRefreshToken, false)

                if (!oldRefreshToken) {
                    return
                }

                const currentConfig = await promisify(readFile)('.env'),
                    updatedConfig = currentConfig
                        .toString()
                        .replace(oldRefreshToken, newRefreshToken)

                await promisify(writeFile)('.env', updatedConfig)
            }
        )

        ring_camera = allCameras[0] // we only have one

        ring_camera.onNewDing.subscribe(ding => {
            got_ring_activity(ding)
        })

        log_line('Connected to Ring')
    }
    catch (err) {
        log_line("🚩 Node couldn't connect to Ring!", true)
    }
}

// handle Ring activity events, such as doorbell rings ("dings") or detected motion
var got_ring_activity = async function (activity) {
    var human_date = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })

    if (activity.kind === 'ding') {
        log_line("⚠️ Someone rang the doorbell", true)

        doorbell_rung()
    }

    if (activity.kind === 'motion') {
        log_line("Ring saw motion", true)

        var date = new Date()
        var hour_of_day = date.getHours()
        if (!(hour_of_day >= config.auto_open_start_hour) && (hour_of_day <= config.auto_open_end_hour)) {
            var log_message = "⚠️ Late-night motion detected on Ring! Check Camhi app for video around " + human_date + "."

            log_line(log_message)
            blynk.notify(log_message)
        }
    }
}

// TODO not working yet
// wait for Ring video and set a Blynk video widget to show it
// async function get_ring_video() {
//     // TODO: support video and events from multiple cameras
//     const video_url = await ring_camera.getRecording()

//     // set the Blynk video widget to show the video
//     blynk.setProperty(config.blynk_pin_video, "url", video_url)

//     log_line('Latest video URL posted to Blynk: ' + video_url)
// }

// connect to Blynk API
async function blynk_connect() {
    try {
        blynk = new BlynkLib.Blynk(config.blynk_doorbell_auth_token)

        blynk.on('connect', function () {
            blynk.syncAll()

            blynk_bridge_gate = new blynk.WidgetBridge(3)
            blynk_bridge_gate.setAuthToken(config.blynk_gate_auth_token)

            blynk_bridge_common = new blynk.WidgetBridge(4)
            blynk_bridge_common.setAuthToken(config.blynk_common_auth_token)

            log_line('Connected to Blynk')
            // log_line("Started bridge service", true)
        })

        blynk_button_auto_open = new blynk.VirtualPin(config.blynk_pin_auto_open)
        blynk_button_send_notifications = new blynk.VirtualPin(config.blynk_pin_send_notifications)

        blynk_button_auto_open.on('write', function (param) {  // reads state of auto open setting
            auto_open = (param == 1)

            log_line("Auto-open set to: " + auto_open)
        })

        blynk_button_send_notifications.on('write', function (param) {  // reads state of notifications setting
            send_notification = (param == 1)

            log_line("Send notifications set to: " + send_notification)
        })
    }
    catch (err) {
        log_line("🚩 Couldn't connect to Blynk!")
    }
}

// upload file to cloud bucket
function upload_file_to_bucket(file, bucket, key) {
    try {
        AWS.config.update({ accessKeyId: '...', secretAccessKey: '...' })

        const s3 = new AWS.S3({
            accessKeyId: config.aws_access_key_id,
            secretAccessKey: config.aws_secret_access_key
        })

        fs.readFile(file, (err, data) => {
            if (err) throw err
            const params = {
                Bucket: bucket, // pass your bucket name
                Key: key, // file will be saved as testBucket/contacts.csv
                Body: JSON.stringify(data, null, 2)
            }
            s3.upload(params, function (s3Err, data) {
                if (s3Err) throw s3Err
                log_line(`File uploaded successfully at ${data.Location}`)
            })
        })
    }
    catch (err) {
        log_line("🚩 Couldn't connect to cloud or upload image to bucket")
    }
}

// captures a still image from an RTSP stream, uploads it to S3, and sets a Blynk Image widget to its URL
async function capture_front_door_image(image_pin, timestamp_pin, send_email) {
    var iso_date = new Date().toISOString()
    var human_date = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
    var gate_capture_filename = config.gate_capture_dir + iso_date + '.jpg'
    //var sudo = '' // if running local
    var sudo = 'sudo -u ubuntu' // if running on Linux

    // capture a still image from the RTSP stream of another camera
    try {
        // TODO move crop setting to config
        execSync('ffmpeg -rtsp_transport tcp -loglevel fatal -i "' + config.rtsp_url + '" -vframes 1 -r 1 -filter:v "crop=745:375:500:165" ' + gate_capture_filename)

        var s3_bucket = config.s3_bucket + "/" + config.s3_dir
        var s3_key = iso_date + ".jpg"
        var s3_url = 's3://' + config.s3_bucket + "/" + config.s3_dir + "/" + iso_date + ".jpg"
        log_line("S3 URL for static camera image: " + s3_url)

        // copy image to S3
        execSync(sudo + ' aws s3 cp ' + gate_capture_filename + ' ' + s3_url)
        // upload_file_to_bucket(gate_capture_filename, s3_bucket, s3_key)

        // parse out the filename of the newly-created image and set the image widget to the S3 URL of the image
        var image_url = config.s3_url + "/" + config.s3_bucket + "/" + config.s3_dir + "/" + iso_date + ".jpg"
        log_line('Setting image URL to ' + image_url)
        blynk.setProperty(image_pin, "urls", image_url)
        blynk.virtualWrite(image_pin, 1)

        // also set the timestamp in the Blynk app
        blynk.virtualWrite(timestamp_pin, human_date)
    }
    catch (err) {
        // log errors, but ignore them and move on
        log_line("🚩 Couldn't capture image")
    }

    if (send_email) {
        // asynchronously mail the image in an attachment
        try {
            exec('echo "See attached image." | mail -r ' + config.ring_account + ' -A ' + gate_capture_filename + ' -s "Doorbell rung at ' + human_date + '" ' + config.ring_account)
        }
        catch (err) {
            log_line("🚩 Couldn't mail image")
        }
    }

    // run the capture through AWS Rekognition and display relevant metadata in the Blynk app
    // try {
    // iso_date ='2019-01-04-18-03-39' // uncomment for test file
    // var stdout = execSync(sudo + ' aws rekognition detect-faces --image "S3Object={Bucket=' + config.s3_bucket + ',Name=' + config.s3_dir + '/' + iso_date + '.jpg}" --attributes ALL --region us-west-2').toString()
    //     var faces_data = JSON.parse(stdout)
    //     var gender = faces_data.FaceDetails[0].Gender.Value.toLowerCase()
    //     var age_low = faces_data.FaceDetails[0].AgeRange.Low
    //     var age_high = faces_data.FaceDetails[0].AgeRange.High
    //     var description = `${gender} age ${age_low}-${age_high}`

    //     log_line(`Detected ${description}`, true)
    //     blynk.virtualWrite(config.blynk_pin_face_description, description)
    // }
    // catch (err) {
    //     log_line("🚩 Couldn't recognize faces or exec Rekognition")

    //     blynk.virtualWrite(config.blynk_pin_face_description, "(undetected)")
    // }
}

// handle doorbell ring events with Blynk logic to open a gate
async function doorbell_rung() {
    // TODO: wrap logs in function that sends to common Blynk terminal as well
    log_line("Setting doorbell state button")
    blynk.virtualWrite(config.blynk_pin_doorbell_state, 1)  // turn doorbell state button to On

    setTimeout(function () { // asynchronously reset the open gate button in a few seconds
        log_line("Restoring doorbell state button")

        blynk.virtualWrite(config.blynk_pin_doorbell_state, 0)  // turn doorbell state button to Off
    }, config.doorbell_state_duration * 1000)

    // Send a push notification if that's enabled in a Blynk button
    if (send_notification) {
        log_line("Blynk notified of doorbell ring")

        var notification = "Someone is ringing the doorbell! Check your email for photo."

        if (auto_open && is_within_auto_open_window()) {
            notification = notification + " Auto-opening the gate."
        }

        blynk.notify(notification)
    }

    // open the gate if that's enabled in a Blynk button
    if (auto_open && is_within_auto_open_window()) {
        log_line("Opening gate")

        setTimeout(function () {
            blynk_bridge_gate.virtualWrite(config.blynk_pin_open_gate, 1) // push the open gate button
        }, config.push_gate_button_delay * 1000)

        // reset the open gate button a few seconds after that
        setTimeout(function () {
            log_line("Closing gate")

            blynk_bridge_gate.virtualWrite(config.blynk_pin_open_gate, 0)
        }, (config.push_gate_button_delay + config.push_gate_button_duration) * 1000)
    }
    else {
        log_line("Not opening gate because auto-open is disabled or it's nighttime", true)
    }

    log_line("Capturing and analyzing front door image")
    capture_front_door_image(config.blynk_pin_ring_image, config.blynk_pin_ring_timestamp, true)
}

// issue IFTTT API calls to a listening 'Webhook applet'
function ifttt_event(event) {
    const https = require('https')
    const options = {
        hostname: 'maker.ifttt.com',
        port: 443,
        path: "/trigger/" + event + "/with/key/" + config.ifttt_key,
        method: 'GET'
    }

    const req = https.request(options, res => {
        // log_line(`statusCode: ${res.statusCode}`)

        // res.on('data', d => {
        //     process.stdout.write(d)
        // })
    })

    req.on('error', error => {
        log_line("🚩 " + error)
    })

    req.end()
}

// notify the Blynk user if a Blynk device is down
async function check_blynk_device_status() {
    var healthcheck_url = "http://blynk-cloud.com/" + config.blynk_gate_auth_token + "/isHardwareConnected"

    request(healthcheck_url, function (error, response, body) {
        if (body === "false" && controller_online == true) {
            controller_online = false

            log_line("🚩 Controller offline. Power cycling.", true)

            // Power cycle the controller via a Tuya-based smart plug
            ifttt_event('controller_power_off') // handler: https://ifttt.com/applets/111599192d
            setTimeout(() => {
                ifttt_event('controller_power_on') // handler: https://ifttt.com/applets/111599214d
            }, 10000)
        }

        if (body === "true") {
            controller_online = true
        }
    })
}

// handle ctrl-c for c8 code coverage checks
process.on('SIGINT', function () {
    log_line("Caught interrupt signal")

    process.exit()
})

// answer IFTTT webhooks to proxy Wyze events to Blynk
server.post('/wyze_event', (request, response) => {
    var sensor = request.body.sensor
    var wyze_message = request.body.message

    response.send("OK") // IFTTT will never read this so it's whatever

    log_line("⚠  " + wyze_message, true)

    if (send_notification) {
        blynk.notify(wyze_message)
    }

    // Capture the image of the person opening the gate
    if (wyze_message.trim() === "Contact Sensor opens on Gate") {
        log_line("Capturing and analyzing front door image")
        capture_front_door_image(config.blynk_pin_open_image, config.blynk_pin_open_timestamp, false)

        blynk_bridge_gate.virtualWrite(config.blynk_pin_gate_open, 0)
    }

    if (wyze_message.trim() === "Contact Sensor closes on Gate") {
        blynk_bridge_gate.virtualWrite(config.blynk_pin_gate_open, 1)
    }

    if (wyze_message.trim() === "Contact Sensor opens on Lockbox") {
        capture_front_door_image(config.blynk_pin_open_image, config.blynk_pin_ring_timestamp, true)
    }
})

// healtcheck endpoint for cloud management
server.get('/healthcheck', (request, response) => {
    capture_front_door_image(config.blynk_pin_ring_image, config.blynk_pin_ring_timestamp, true)

    response.json({ status: "OK" })
})

server.listen(config.http_port, (err) => {
    if (err) {
        log_line('🚩 ' + err)
        return
    }

    log_line(`Server is listening on ${config.http_port}`)
})

// connect to APIs
ring_connect()
blynk_connect()

// check now and then poll whether controller is online every 60 seconds
setInterval(check_blynk_device_status, config.poll_controller_interval * 1000)