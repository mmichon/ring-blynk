// NOTE: for better security, expose these in env variables
var config = {};

// credentials
config.ring_token = 'token';                    // initial ring auth token -- get this using 'npx -p ring-client-api ring-auth-cli'
config.blynk_doorbell_auth_token = 'token';     // auth token for this Ring doorbell device
config.blynk_gate_auth_token = 'token';         // auth token for 'gate' (another) Blynk device
config.blynk_common_auth_token = 'token';       // auth token for common widgets (including logs)
config.aws_access_key_id = 'token';
config.aws_secret_access_key = 'token';
config.ifttt_key = 'token';

// image capture service for another camera. Set to null string if you don't have an image capture service.
config.s3_url = 'https://s3-us-west-2.amazonaws.com'                        // URL to your S3 region prefix
config.s3_bucket = 'bucket'                                                 // Name of your S3 bucket
config.s3_dir = 'captures'                                                  // Dir in your S3 bucket to store images
config.rtsp_url = 'rtsp://stream_url';                                      // URL to alternate camera stream
// config.gate_capture_dir = '/home/ubuntu/tmp/gate-captures/';                // Where to store captured images
var config.gate_capture_dir = '/tmp/'; // if running locally for testing
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
config.blynk_pin_gate_open = 2;

// timers
config.doorbell_state_duration = 60; // amount of time in seconds to show doorbell as recently pressed in Blynk
config.push_gate_button_delay = 0; // amount of time to wait between doorbell press and gate open
config.push_gate_button_duration = 4; // amount of time to hold gate open
config.video_wait_time = 60; // wait time until Ring video is likely available after button push in seconds
config.auto_open_start_hour = 7; // time when auto-open window starts
config.auto_open_end_hour = 22; // time when auto-open window ends
config.motion_detect_start_hour = 2; // time to start motion notifications
config.motion_detect_end_hour = 7; // time to end motion notifications
config.poll_controller_interval = 60; // poll controller device interval in seconds

module.exports = config;