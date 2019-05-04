// NOTE: for better security, expose these in env variables
var config = {};

// credentials
config.ring_account = 'your@email.com';
config.ring_password = 'password';
config.blynk_auth_token = 'token'; // auth token for this Ring doorbell device
config.blynk_bridge_auth_token = 'token';  // auth token for 'entrance' (another) Blynk device you want to interface with

config.external_camera_capture_url = 'url';                                 // URL to image capture service for another camera. Set to null string if you don't have an image capture service
config.s3_url = 'https://s3-us-west-2.amazonaws.com'                        // Your S3 region
config.s3_bucket = 'bucket'                                                 // Name of your S3 bucket
config.s3_dir = 'captures'                                                  // Dir in your S3 bucket to store images
config.rtsp_url = 'rtsp://stream_url';                                      // URL to alternate camera stream
config.entrance_capture_dir = '/home/ubuntu/tmp/entrance-captures/';        // Where to store captured images

// virtual pin settings for the Blynk app
config.blynk_pin_auto_open = 2;
config.blynk_pin_open_gate = 3;
config.blynk_pin_doorbell_state = 5;
config.blynk_pin_video = 6;
config.blynk_pin_send_notifications = 7;
config.blynk_pin_image = 8;
config.blynk_pin_timestamp = 9;
config.blynk_pin_face_description = 10;

// timers
config.doorbell_state_duration = 60; // amount of time to show doorbell as recently pressed in Blynk
config.push_gate_button_delay = 4; // amount of time to wait between doorbell press and gate open
config.push_gate_button_duration = 4; // amount of time to hold gate open

module.exports = config;