// NOTE: for better security, expose these in env variables
var config = {};

// credentials
config.ring_account = 'your@email.com';
config.ring_password = 'password';
config.blynk_doorbell_auth_token = 'token'; // auth token for this Ring doorbell device
config.blynk_entrance_auth_token = 'token';  // auth token for 'entrance' (another) Blynk device
config.blynk_common_auth_token = 'token'; // auth token for common widgets (including logs)

// image capture service for another camera. Set to null string if you don't have an image capture service.
config.s3_url = 'https://s3-us-west-2.amazonaws.com'                        // URL to your S3 region prefix
config.s3_bucket = 'bucket'                                                 // Name of your S3 bucket
config.s3_dir = 'captures'                                                  // Dir in your S3 bucket to store images
config.rtsp_url = 'rtsp://stream_url';                                      // URL to alternate camera stream
config.entrance_capture_dir = '/home/ubuntu/tmp/entrance-captures/';        // Where to store captured images
//var config.entrance_capture_dir = '/tmp/'; // if running locally for testing
config.http_port = 5000;

// virtual pin settings for the Blynk app
config.blynk_pin_auto_open = 2;
config.blynk_pin_open_gate = 3;
config.blynk_pin_doorbell_state = 5;
config.blynk_pin_video = 6;
config.blynk_pin_send_notifications = 7;
config.blynk_pin_ring_image = 8;
config.blynk_pin_ring_timestamp = 9;
config.blynk_pin_open_image = 11;
config.blynk_pin_open_timestamp = 12;
config.blynk_pin_face_description = 10;
config.blynk_pin_terminal = 1;

// timers
config.doorbell_state_duration = 60; // amount of time to show doorbell as recently pressed in Blynk
config.push_gate_button_delay = 0; // amount of time to wait between doorbell press and gate open
config.push_gate_button_duration = 4; // amount of time to hold gate open
config.video_wait_time = 60; // wait time until Ring video is likely available after button push
config.morning_hour = 7; // daytime is between 7AM and
config.evening_hour = 22; // 10PM

module.exports = config;