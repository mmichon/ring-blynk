# ring-blynk
This Node.js app interfaces with a Ring and IFTTT to send device events to a Blynk app or Blynk-connected devices like microcontrollers.

### Example Blynk UI
<img src="https://github.com/mmichon/ring-blynk/blob/master/sample_blynk_ui.jpeg?raw=true" width=300>

### Features
* Responds to Ring 'ding' and motion events
* Responds to IFTTT webhook events, with example Wyze sensor code
* Sets the state of a button in a Blynk app which shows whether the Ring doorbell has been rung recently
* Sends a Blynk push notification when the doorbell has been rung
* Send events to Blynk to do perform additional functions, for instance, opening and closing a gate lock automatically
* Waits for the video from the Ring doorbell event and sends it to the Blynk video widget to show the video
* Does other server-side business, like capturing a still image from an RTSP camera stream, copying it to S3, emailing it to a user, running it through AWS Rekognition, and showing it up on the Blynk app

### Setup
1. `npm install ring-api blynk-library`
1. `npx -p ring-client-api ring-auth-cli` to get your Ring's 2FA OAUTH credentials (it'll get and save reauth creds thereafter)
1. Edit `config.js` and set all credentials and settings to that of your own Ring doorbell and Blynk app
1. `tsc ring-blynk.ts && node ring-blynk.js`
